import React, { useMemo, useCallback } from 'react';
import moment from 'moment';
import classnames from 'classnames';
import LoadingIndicator from 'components/LoadingIndicator';
import { FormattedMessage as T, useIntl } from 'react-intl';

export default function FinancialSheet({
  companyName,
  sheetType,
  fromDate,
  toDate,
  children,
  accountingBasis,
  name,
  loading,
  className,
  basis,
}) {
  const formattedFromDate = moment(fromDate).format('DD MMMM YYYY');
  const formattedToDate = moment(toDate).format('DD MMMM YYYY');
  const nameModifer = name ? `financial-sheet--${name}` : '';
  const { formatMessage } = useIntl();
  const methodsLabels = useMemo(
    () => ({
      cash: formatMessage({id:'cash'}),
      accrual: formatMessage({id:'accrual'}),
    }),
    []
  );
  const getBasisLabel = useCallback((b) => methodsLabels[b], [methodsLabels]);
  const basisLabel = useMemo(() => getBasisLabel(basis), [
    getBasisLabel,
    basis,
  ]);

  return (
    <div className={classnames('financial-sheet', nameModifer, className)}>
      <LoadingIndicator loading={loading} spinnerSize={34} />

      <div
        className={classnames('financial-sheet__inner', {
          'is-loading': loading,
        })}
      >
        <h1 class='financial-sheet__title'>{companyName}</h1>
        <h6 class='financial-sheet__sheet-type'>{sheetType}</h6>
        <div class='financial-sheet__date'>
      <T id={'from'}/> {formattedFromDate} | <T id={'to'}/> {formattedToDate}
        </div>

        <div class='financial-sheet__table'>{children}</div>
        <div class='financial-sheet__accounting-basis'>{accountingBasis}</div>

        {basisLabel && (
          <div class='financial-sheet__basis'>
            <T id={'accounting_basis'}/> {basisLabel}
          </div>
        )}
      </div>
    </div>
  );
}
