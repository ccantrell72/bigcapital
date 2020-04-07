import { check, query, oneOf, validationResult, param } from 'express-validator';
import express from 'express';
import { difference } from 'lodash';
import moment from 'moment';
import Account from '@/models/Account';
import asyncMiddleware from '@/http/middleware/asyncMiddleware';
import JWTAuth from '@/http/middleware/jwtAuth';
import JournalPoster from '@/services/Accounting/JournalPoster';
import JournalEntry from '@/services/Accounting/JournalEntry';
import ManualJournal from '@/models/JournalEntry';
import AccountTransaction from '@/models/AccountTransaction';
import Resource from '@/models/Resource';
import View from '@/models/View';
import {
  mapViewRolesToConditionals,
  validateViewRoles,
} from '@/lib/ViewRolesBuilder';
import FilterRoles from '@/lib/FilterRoles';

export default {
  /**
   * Router constructor.
   */
  router() {
    const router = express.Router();
    router.use(JWTAuth);

    router.get('/manual-journals',
      this.manualJournals.validation,
      asyncMiddleware(this.manualJournals.handler));

    router.post('/make-journal-entries',
      this.makeJournalEntries.validation,
      asyncMiddleware(this.makeJournalEntries.handler));

    router.post('/manual-journal/:id',
      this.editManualJournal.validation,
      asyncMiddleware(this.editManualJournal.handler));

    router.delete('/manual-journals/:id',
      this.deleteManualJournal.validation,
      asyncMiddleware(this.deleteManualJournal.handler));

    router.post('/recurring-journal-entries',
      this.recurringJournalEntries.validation,
      asyncMiddleware(this.recurringJournalEntries.handler));

    router.post('quick-journal-entries',
      this.quickJournalEntries.validation,
      asyncMiddleware(this.quickJournalEntries.handler));

    return router;
  },

  /**
   * Retrieve manual journals,
   */
  manualJournals: {
    validation: [
      query('custom_view_id').optional().isNumeric().toInt(),
      query('stringified_filter_roles').optional().isJSON(),
    ],
    async handler(req, res) {
      const validationErrors = validationResult(req);

      if (!validationErrors.isEmpty()) {
        return res.boom.badData(null, {
          code: 'validation_error', ...validationErrors,
        });
      }
      const filter = {
        filter_roles: [],
        ...req.query,
      };
      if (filter.stringified_filter_roles) {
        filter.filter_roles = JSON.parse(filter.stringified_filter_roles);
      }

      const errorReasons = [];
      const viewConditionals = [];
      const manualJournalsResource = await Resource.query()
        .where('name', 'manual_journals')
        .withGraphFetched('fields')
        .first();

      if (!manualJournalsResource) {
        return res.status(400).send({
          errors: [{ type: 'MANUAL_JOURNALS.RESOURCE.NOT.FOUND', code: 200 }],
        });
      }

      const view = await View.query().onBuild((builder) => {
        if (filter.custom_view_id) {
          builder.where('id', filter.custom_view_id);
        } else {
          builder.where('favourite', true);
        }
        builder.where('resource_id', manualJournalsResource.id);
        builder.withGraphFetched('roles.field');
        builder.withGraphFetched('columns');
        builder.first();
      });

      if (view && view.roles.length > 0) {
        viewConditionals.push(
          ...mapViewRolesToConditionals(view.roles),
        );
        if (!validateViewRoles(viewConditionals, view.rolesLogicExpression)) {
          errorReasons.push({ type: 'VIEW.LOGIC.EXPRESSION.INVALID', code: 400 });
        }
      }
      // Validate the accounts resource fields.
      const filterRoles = new FilterRoles(Resource.tableName,
        filter.filter_roles.map((role) => ({ ...role, columnKey: role.fieldKey })),
        manualJournalsResource.fields);

      if (filterRoles.validateFilterRoles().length > 0) {
        errorReasons.push({ type: 'ACCOUNTS.RESOURCE.HAS.NO.GIVEN.FIELDS', code: 500 });
      }
      if (errorReasons.length > 0) {
        return res.status(400).send({ errors: errorReasons });
      }
      // Manual journals.
      const manualJournals = await ManualJournal.query();

      return res.status(200).send({
        manualJournals,
      });
    },
  },

  /**
   * Make journal entrires.
   */
  makeJournalEntries: {
    validation: [
      check('date').exists().isISO8601(),
      check('journal_number').exists().trim().escape(),
      check('transaction_type').optional({ nullable: true }).trim().escape(),
      check('reference').optional({ nullable: true }),
      check('description').optional().trim().escape(),
      check('entries').isArray({ min: 2 }),
      check('entries.*.credit').optional({ nullable: true }).isNumeric().toInt(),
      check('entries.*.debit').optional({ nullable: true }).isNumeric().toInt(),
      check('entries.*.account_id').isNumeric().toInt(),
      check('entries.*.note').optional(),
    ],
    async handler(req, res) {
      const validationErrors = validationResult(req);

      if (!validationErrors.isEmpty()) {
        return res.boom.badData(null, {
          code: 'validation_error', ...validationErrors,
        });
      }
      const form = {
        date: new Date(),
        transaction_type: 'journal',
        reference: '',
        ...req.body,
      };

      let totalCredit = 0;
      let totalDebit = 0;

      const { user } = req;
      const errorReasons = [];
      const entries = form.entries.filter((entry) => (entry.credit || entry.debit));
      const formattedDate = moment(form.date).format('YYYY-MM-DD');

      entries.forEach((entry) => {
        if (entry.credit > 0) {
          totalCredit += entry.credit;
        }
        if (entry.debit > 0) {
          totalDebit += entry.debit;
        }
      });

      if (totalCredit <= 0 || totalDebit <= 0) {
        errorReasons.push({
          type: 'CREDIT.DEBIT.SUMATION.SHOULD.NOT.EQUAL.ZERO',
          code: 400,
        });
      }
      if (totalCredit !== totalDebit) {
        errorReasons.push({ type: 'CREDIT.DEBIT.NOT.EQUALS', code: 100 });
      }
      const accountsIds = entries.map((entry) => entry.account_id);
      const accounts = await Account.query().whereIn('id', accountsIds)
        .withGraphFetched('type');

      const storedAccountsIds = accounts.map((account) => account.id);

      if (difference(accountsIds, storedAccountsIds).length > 0) {
        errorReasons.push({ type: 'ACCOUNTS.IDS.NOT.FOUND', code: 200 });
      }

      const journalNumber = await ManualJournal.query()
        .where('journal_number', form.journal_number);

      if (journalNumber.length > 0) {
        errorReasons.push({ type: 'JOURNAL.NUMBER.ALREADY.EXISTS', code: 300 });
      }
      if (errorReasons.length > 0) {
        return res.status(400).send({ errors: errorReasons });
      }

      // Save manual journal transaction.
      const manualJournal = await ManualJournal.query().insert({
        reference: form.reference,
        transaction_type: 'Journal',
        journal_number: form.journal_number,
        amount: totalCredit,
        date: formattedDate,
        description: form.description,
        user_id: user.id,
      });
      const journalPoster = new JournalPoster();

      entries.forEach((entry) => {
        const account = accounts.find((a) => a.id === entry.account_id);

        const jouranlEntry = new JournalEntry({
          debit: entry.debit,
          credit: entry.credit,
          account: account.id,
          referenceType: 'Journal',
          referenceId: manualJournal.id,
          accountNormal: account.type.normal,
          note: entry.note,
          date: formattedDate,
          userId: user.id,
        });
        if (entry.debit) {
          journalPoster.debit(jouranlEntry);
        } else {
          journalPoster.credit(jouranlEntry);
        }
      });

      // Saves the journal entries and accounts balance changes.
      await Promise.all([
        journalPoster.saveEntries(),
        journalPoster.saveBalance(),
      ]);
      return res.status(200).send({ id: manualJournal.id });
    },
  },

  /**
   * Saves recurring journal entries template.
   */
  recurringJournalEntries: {
    validation: [
      check('template_name').exists(),
      check('recurrence').exists(),
      check('active').optional().isBoolean().toBoolean(),
      check('entries').isArray({ min: 1 }),
      check('entries.*.credit').isNumeric().toInt(),
      check('entries.*.debit').isNumeric().toInt(),
      check('entries.*.account_id').isNumeric().toInt(),
      check('entries.*.note').optional(),
    ],
    async handler(req, res) {
      const validationErrors = validationResult(req);

      if (!validationErrors.isEmpty()) {
        return res.boom.badData(null, {
          code: 'validation_error', ...validationErrors,
        });
      }
    },
  },

  editManualJournal: {
    validation: [
      param('id').exists().isNumeric().toInt(),
      check('date').exists().isISO8601(),
      check('journal_number').exists().trim().escape(),
      check('transaction_type').optional({ nullable: true }).trim().escape(),
      check('reference').optional({ nullable: true }),
      check('description').optional().trim().escape(),
      check('entries').isArray({ min: 2 }),
      check('entries.*.credit').optional({ nullable: true }).isNumeric().toInt(),
      check('entries.*.debit').optional({ nullable: true }).isNumeric().toInt(),
      check('entries.*.account_id').isNumeric().toInt(),
      check('entries.*.note').optional(),
    ],
    async handler(req, res) {
      const validationErrors = validationResult(req);

      if (!validationErrors.isEmpty()) {
        return res.boom.badData(null, {
          code: 'validation_error', ...validationErrors,
        });
      }
      const form = {
        date: new Date(),
        transaction_type: 'journal',
        reference: '',
        ...req.body,
      };
      const { id } = req.params;
      const manualJournal = await ManualJournal.query().where('id', id).first();

      if (!manualJournal) {
        return res.status(4040).send({
          errors: [{ type: 'MANUAL.JOURNAL.NOT.FOUND', code: 100 }],
        });
      }
      let totalCredit = 0;
      let totalDebit = 0;

      const { user } = req;
      const errorReasons = [];
      const entries = form.entries.filter((entry) => (entry.credit || entry.debit));
      const formattedDate = moment(form.date).format('YYYY-MM-DD');

      entries.forEach((entry) => {
        if (entry.credit > 0) {
          totalCredit += entry.credit;
        }
        if (entry.debit > 0) {
          totalDebit += entry.debit;
        }
      });
      if (totalCredit <= 0 || totalDebit <= 0) {
        errorReasons.push({
          type: 'CREDIT.DEBIT.SUMATION.SHOULD.NOT.EQUAL.ZERO',
          code: 400,
        });
      }
      if (totalCredit !== totalDebit) {
        errorReasons.push({ type: 'CREDIT.DEBIT.NOT.EQUALS', code: 100 });
      }
      const journalNumber = await ManualJournal.query()
        .where('journal_number', form.journal_number)
        .whereNot('id', id)
        .first();

      if (journalNumber) {
        errorReasons.push({ type: 'JOURNAL.NUMBER.ALREADY.EXISTS', code: 300 });
      }
      const accountsIds = entries.map((entry) => entry.account_id);
      const accounts = await Account.query().whereIn('id', accountsIds)
        .withGraphFetched('type');

      const storedAccountsIds = accounts.map((account) => account.id);

      if (difference(accountsIds, storedAccountsIds).length > 0) {
        errorReasons.push({ type: 'ACCOUNTS.IDS.NOT.FOUND', code: 200 });
      }
      if (errorReasons.length > 0) {
        return res.status(400).send({ errors: errorReasons });
      }

      await ManualJournal.query()
        .where('id', manualJournal.id)
        .update({
          reference: form.reference,
          transaction_type: 'Journal',
          journalNumber: form.journal_number,
          amount: totalCredit,
          date: formattedDate,
          description: form.description,
        });

      const transactions = await AccountTransaction.query()
        .whereIn('reference_type', ['Journal'])
        .where('reference_id', manualJournal.id)
        .withGraphFetched('account.type');

      const journal = new JournalPoster();
      journal.loadEntries(transactions);
      journal.removeEntries();

      await Promise.all([
        journal.deleteEntries(),
        journal.saveEntries(),
        journal.saveBalance(),
      ]);

      return res.status(200).send({});
    },
  },

  getManualJournal: {
    validation: [
      param('id').exists().isNumeric().toInt(),
    ],
    async handler(req, res) {
      const validationErrors = validationResult(req);

      if (!validationErrors.isEmpty()) {
        return res.boom.badData(null, {
          code: 'validation_error', ...validationErrors,
        });
      }
      const { id } = req.params;
      const manualJournal = await ManualJournal.query()
        .where('id', id).first();

      if (!manualJournal) {
        return res.status(404).send({
          errors: [{ type: 'MANUAL.JOURNAL.NOT.FOUND', code: 100 }],
        });
      }
      
    },
  },

  /**
   * Deletes manual journal transactions and associated
   * accounts transactions.
   */
  deleteManualJournal: {
    validation: [
      param('id').exists().isNumeric().toInt(),
    ],
    async handler(req, res) {
      const validationErrors = validationResult(req);

      if (!validationErrors.isEmpty()) {
        return res.boom.badData(null, {
          code: 'validation_error', ...validationErrors,
        });
      }
      const { id } = req.params;
      const manualJournal = await ManualJournal.query()
        .where('id', id).first();

      if (!manualJournal) {
        return res.status(404).send({
          errors: [{ type: 'MANUAL.JOURNAL.NOT.FOUND', code: 100 }],
        });
      }
      const transactions = await AccountTransaction.query()
        .whereIn('reference_type', ['Journal', 'ManualJournal'])
        .where('reference_id', manualJournal.id)
        .withGraphFetched('account.type');

      const journal = new JournalPoster();
      journal.loadEntries(transactions);
      journal.removeEntries();

      await ManualJournal.query()
        .where('id', manualJournal.id)
        .delete();

      await Promise.all([
        journal.deleteEntries(),
        journal.saveBalance(),
      ]);
      return res.status(200).send({ id });
    },
  },

  recurringJournalsList: {
    validation: [
      query('page').optional().isNumeric().toInt(),
      query('page_size').optional().isNumeric().toInt(),
      query('template_name').optional(),
    ],
    async handler(req, res) {
      const validationErrors = validationResult(req);

      if (!validationErrors.isEmpty()) {
        return res.boom.badData(null, {
          code: 'validation_error', ...validationErrors,
        });
      }
    },
  },

  quickJournalEntries: {
    validation: [
      check('date').exists().isISO8601(),
      check('amount').exists().isNumeric().toFloat(),
      check('credit_account_id').exists().isNumeric().toInt(),
      check('debit_account_id').exists().isNumeric().toInt(),
      check('transaction_type').exists(),
      check('note').optional(),
    ],
    async handler(req, res) {
      const validationErrors = validationResult(req);

      if (!validationErrors.isEmpty()) {
        return res.boom.badData(null, {
          code: 'validation_error', ...validationErrors,
        });
      }
      const errorReasons = [];
      const form = { ...req.body };

      const foundAccounts = await Account.query()
        .where('id', form.credit_account_id)
        .orWhere('id', form.debit_account_id);

      const creditAccount = foundAccounts.find((a) => a.id === form.credit_account_id);
      const debitAccount = foundAccounts.find((a) => a.id === form.debit_account_id);

      if (!creditAccount) {
        errorReasons.push({ type: 'CREDIT_ACCOUNT.NOT.EXIST', code: 100 });
      }
      if (!debitAccount) {
        errorReasons.push({ type: 'DEBIT_ACCOUNT.NOT.EXIST', code: 200 });
      }
      if (errorReasons.length > 0) {
        return res.status(400).send({ errors: errorReasons });
      }

      // const journalPoster = new JournalPoster();
      // const journalCredit = new JournalEntry({
      //   debit: 
      //   account: debitAccount.id,
      //   referenceId: 
      // })

      return res.status(200).send();
    },
  },
};
