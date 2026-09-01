/**
 * Display-only mirror of the toolkit's tool catalogue, used by the scope panel
 * to show what the agent was NOT given. The run contract only carries
 * `toolNames` + `toolCatalogSize`, so the withheld set has to be derived here.
 * Source: docs/tool-schemas.txt (Cashfree Agent Toolkit 1.1.0, 40 tools).
 */

export interface CatalogGroup {
  label: string;
  /** Short line under the group heading in the scope panel. */
  hint: string;
  tools: { name: string; write: boolean }[];
}

const w = (name: string) => ({ name, write: true });
const r = (name: string) => ({ name, write: false });

export const TOOL_CATALOG: CatalogGroup[] = [
  {
    label: 'Orders',
    hint: 'Create, read and close payment orders',
    tools: [
      w('createOrder'),
      r('getOrder'),
      w('terminateOrder'),
      r('getOrderExtendedData'),
      w('updateOrderExtendedData'),
      w('authorizeOrder'),
    ],
  },
  {
    label: 'Payments',
    hint: 'Charge an order and read what happened',
    tools: [
      w('orderPayUsingUpi'),
      w('orderPayUsingNetbanking'),
      w('orderPayUsingApp'),
      w('orderPayUsingPlainCard'),
      w('orderPayUsingSavedCard'),
      r('getPaymentsForOrder'),
      r('getPaymentById'),
      r('getEligiblePaymentMethods'),
      r('getEligibleOffers'),
    ],
  },
  {
    label: 'Refunds',
    hint: 'Money out',
    tools: [w('createRefund'), r('getAllRefunds'), r('getRefund')],
  },
  {
    label: 'Customers',
    hint: 'Customer records and saved instruments',
    tools: [
      w('createCustomer'),
      r('fetchCustomerInstruments'),
      r('fetchCustomerInstrument'),
      w('deleteCustomerInstrument'),
    ],
  },
  {
    label: 'Verification & KYC',
    hint: 'Not part of the support agent at all',
    tools: [
      r('verifyPan360'),
      r('verifyGstin'),
      r('verifyNameMatch'),
      w('createReversePennyDrop'),
      r('getReversePennyDropStatus'),
      r('verifyBankAccount'),
      r('verifyIfsc'),
      w('mobile360SendOtp'),
      w('mobile360VerifyOtp'),
      w('generateKycLink'),
      r('getKycLinkStatus'),
      w('generateStaticKycLink'),
      w('deactivateStaticKycLink'),
      w('smartOcr'),
      w('createVkycUser'),
      w('initiateVkyc'),
      w('generateVkycAuthToken'),
      r('getVkycStatus'),
    ],
  },
];

export const CATALOG_TOOL_COUNT = TOOL_CATALOG.reduce(
  (n, g) => n + g.tools.length,
  0,
);

export function isWriteTool(name: string): boolean {
  for (const group of TOOL_CATALOG) {
    for (const tool of group.tools) {
      if (tool.name === name) return tool.write;
    }
  }
  return false;
}
