# Inventory Model Notes

- `blood_inventory` stores current stock at batch/location granularity.
- A unique expression index avoids duplicate rows for the same org + blood type + location + expiry batch.
- `blood_inventory_transactions` is append-only and tracks all stock movements.
- `transaction_type` supports `add_stock`, `usage`, `wastage`, and `adjustment`.
- Suggested client flow: write a transaction first, then refresh dashboard aggregates.
