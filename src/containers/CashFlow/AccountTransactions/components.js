import React from 'react';
import intl from 'react-intl-universal';

import { Intent, Menu, MenuItem } from '@blueprintjs/core';

import { MaterialProgressBar } from 'components';
import { FormatDateCell, If, Icon } from 'components';
import { useAccountTransactionsContext } from './AccountTransactionsProvider';
import { TRANSACRIONS_TYPE } from 'common/cashflowOptions';
import { safeCallback } from 'utils';

export function ActionsMenu({ payload: { onDelete }, row: { original } }) {
  return (
    <If condition={TRANSACRIONS_TYPE.includes(original.reference_type)}>
      <Menu>
        <MenuItem
          text={intl.get('delete_transaction')}
          intent={Intent.DANGER}
          onClick={safeCallback(onDelete, original)}
          icon={<Icon icon="trash-16" iconSize={16} />}
        />
      </Menu>
    </If>
  );
}
/**
 * Retrieve account transctions table columns.
 */
export function useAccountTransactionsColumns() {
  return React.useMemo(
    () => [
      {
        id: 'date',
        Header: intl.get('date'),
        accessor: 'date',
        Cell: FormatDateCell,
        width: 110,
        className: 'date',
      },
      {
        id: 'type',
        Header: intl.get('type'),
        accessor: 'reference_type_formatted',
        className: 'type',
        width: 140,
        textOverview: true,
      },
      {
        id: 'transaction_number',
        Header: intl.get('transaction_number'),
        accessor: 'transaction_number',
        width: 160,
        className: 'transaction_number',
      },
      {
        id: 'reference_number',
        Header: intl.get('reference_no'),
        accessor: 'reference_number',
        width: 160,
        className: 'reference_number',
      },
      {
        id: 'deposit',
        Header: intl.get('cash_flow.label.deposit'),
        accessor: 'formatted_deposit',
        width: 110,
        className: 'deposit',
        textOverview: true,
        align: 'right',
      },
      {
        id: 'withdrawal',
        Header: intl.get('cash_flow.label.withdrawal'),
        accessor: 'formatted_withdrawal',
        className: 'withdrawal',
        width: 150,
        textOverview: true,
        align: 'right',
      },
      {
        id: 'running_balance',
        Header: intl.get('cash_flow.label.running_balance'),
        accessor: 'running_balance',
        className: 'running_balance',
        width: 150,
        textOverview: true,
        align: 'right',
      },
    ],
    [],
  );
}

/**
 * Account transactions progress bar.
 */
export function AccountTransactionsProgressBar() {
  const { isCashFlowTransactionsLoading } = useAccountTransactionsContext();

  return isCashFlowTransactionsLoading ? <MaterialProgressBar /> : null;
}
