// Client-side price calculation for instant feedback while choosing services (Ref 10.4).
// The backend recalculates on booking; its total is the one that is charged.

/**
 * @param {{id:number,name:string,category:string,price:number}} service main service
 * @param {{addOn:{id:number,name:string,price:number}, nailCount:number}[]} addOns Stone add-ons, priced per nail
 * @param {number} deposit booking deposit
 * @param {{id:number,name:string,price:number}|null} removal a removal done before the main service, if any
 */
export function calculateQuote(service, addOns, deposit, removal = null) {
  const lines = []
  // A removal before a new set comes first, as it does in the appointment.
  if (removal) {
    lines.push({ itemId: removal.id, name: `Removal (${removal.name})`, category: 'Removal', pricingUnit: 'per service',
      unitPrice: removal.price, quantity: 1, lineTotal: removal.price })
  }
  if (service) {
    lines.push({ itemId: service.id, name: service.name, category: service.category, pricingUnit: 'per service',
      unitPrice: service.price, quantity: 1, lineTotal: service.price })
  }
  for (const { addOn, nailCount } of addOns) {
    lines.push({ itemId: addOn.id, name: addOn.name, category: 'Stone', pricingUnit: 'per nail',
      unitPrice: addOn.price, quantity: nailCount, lineTotal: round(addOn.price * nailCount) })
  }
  const total = round(lines.reduce((sum, line) => sum + line.lineTotal, 0))
  // A service cheaper than the deposit asks only its price (same rule as the backend): nobody pays more than it costs.
  const due = total > 0 ? Math.min(deposit, total) : deposit
  // Paying in full covers the total; it is never less than the non-refundable deposit it includes.
  return { lines, total, deposit: due, balanceDue: Math.max(0, round(total - due)), fullAmount: Math.max(total, due) }
}

const round = (value) => Math.round(value * 100) / 100
