import { Inject, Service } from 'typedi';
import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import BaseController from '@/api/controllers/BaseController';
import asyncMiddleware from '@/api/middleware/asyncMiddleware';
import { TaxRatesApplication } from '@/services/TaxRates/TaxRatesApplication';
import { HookNextFunction } from 'mongoose';
import { ServiceError } from '@/exceptions';
import { ERRORS } from '@/services/TaxRates/constants';

@Service()
export class TaxRatesController extends BaseController {
  @Inject()
  private taxRatesApplication: TaxRatesApplication;

  /**
   * Router constructor.
   */
  public router() {
    const router = Router();

    router.post(
      '/',
      this.taxRateValidationSchema,
      this.validationResult,
      asyncMiddleware(this.createTaxRate.bind(this)),
      this.handleServiceErrors
    );
    router.post(
      '/:id',
      [param('id').exists().toInt(), ...this.taxRateValidationSchema],
      this.validationResult,
      asyncMiddleware(this.editTaxRate.bind(this)),
      this.handleServiceErrors
    );
    router.delete(
      '/:id',
      [param('id').exists().toInt()],
      this.validationResult,
      asyncMiddleware(this.deleteTaxRate.bind(this)),
      this.handleServiceErrors
    );
    router.get(
      '/:id',
      [param('id').exists().toInt()],
      this.validationResult,
      asyncMiddleware(this.getTaxRate.bind(this)),
      this.handleServiceErrors
    );
    router.get(
      '/',
      this.validationResult,
      asyncMiddleware(this.getTaxRates.bind(this)),
      this.handleServiceErrors
    );
    return router;
  }

  /**
   * Tax rate validation schema.
   */
  private get taxRateValidationSchema() {
    return [
      body('name').exists(),
      body('code').exists().isString(),
      body('rate').exists().isNumeric().toFloat(),
      body('is_non_recoverable').optional().isBoolean().default(false),
      body('status').optional().toUpperCase().isIn(['ARCHIVED', 'ACTIVE']),
    ];
  }

  /**
   * Creates a new tax rate.
   * @param {Request} req -
   * @param {Response} res -
   */
  public async createTaxRate(req: Request, res: Response, next) {
    const { tenantId } = req;
    const createTaxRateDTO = this.matchedBodyData(req);

    try {
      const taxRate = await this.taxRatesApplication.createTaxRate(
        tenantId,
        createTaxRateDTO
      );
      return res.status(200).send({
        data: taxRate,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Edits the given tax rate.
   * @param {Request} req -
   * @param {Response} res -
   */
  public async editTaxRate(req: Request, res: Response, next) {
    const { tenantId } = req;
    const editTaxRateDTO = this.matchedBodyData(req);
    const { id: taxRateId } = req.params;

    try {
      const taxRate = await this.taxRatesApplication.editTaxRate(
        tenantId,
        taxRateId,
        editTaxRateDTO
      );
      return res.status(200).send({
        data: taxRate,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deletes the given tax rate.
   * @param {Request} req -
   * @param {Response} res -
   */
  public async deleteTaxRate(req: Request, res: Response, next) {
    const { tenantId } = req;
    const { id: taxRateId } = req.params;

    try {
      await this.taxRatesApplication.deleteTaxRate(tenantId, taxRateId);

      return res.status(200).send({
        code: 200,
        message: 'The tax rate has been deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieves the given tax rate.
   * @param {Request} req -
   * @param {Response} res -
   */
  public async getTaxRate(req: Request, res: Response, next) {
    const { tenantId } = req;
    const { id: taxRateId } = req.params;

    try {
      const taxRate = await this.taxRatesApplication.getTaxRate(
        tenantId,
        taxRateId
      );
      return res.status(200).send({ data: taxRate });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieves the tax rates list.
   * @param {Request} req -
   * @param {Response} res -
   */
  public async getTaxRates(req: Request, res: Response, next) {
    const { tenantId } = req;

    try {
      const taxRates = await this.taxRatesApplication.getTaxRates(tenantId);

      return res.status(200).send({ data: taxRates });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handles service errors.
   * @param {Error} error
   * @param {Request} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  private handleServiceErrors(
    error: Error,
    req: Request,
    res: Response,
    next: HookNextFunction
  ) {
    if (error instanceof ServiceError) {
      if (error.errorType === ERRORS.TAX_CODE_NOT_UNIQUE) {
        return res.boom.badRequest(null, {
          errors: [{ type: ERRORS.TAX_CODE_NOT_UNIQUE, code: 100 }],
        });
      }
      if (error.errorType === ERRORS.TAX_RATE_NOT_FOUND) {
        return res.boom.badRequest(null, {
          errors: [{ type: ERRORS.TAX_RATE_NOT_FOUND, code: 200 }],
        });
      }
    }
    next(error);
  }
}
