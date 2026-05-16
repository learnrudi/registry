import { createPlaidClient } from "../api/client.js";
import { ItemSelectorSchema, type ItemSelectorInput } from "../schemas.js";
import { getLinkedItem, redactItem } from "./tokens.js";

export async function listAccounts(rawInput: ItemSelectorInput = {}) {
  const input = ItemSelectorSchema.parse(rawInput);
  const item = await getLinkedItem(input.itemId);
  const client = createPlaidClient();
  const response = await client.accountsGet({ access_token: item.accessToken });

  return {
    item: redactItem(item),
    accounts: response.data.accounts,
    itemMetadata: response.data.item,
    requestId: response.data.request_id,
  };
}

export async function getBalances(rawInput: ItemSelectorInput = {}) {
  const input = ItemSelectorSchema.parse(rawInput);
  const item = await getLinkedItem(input.itemId);
  const client = createPlaidClient();
  const response = await client.accountsBalanceGet({
    access_token: item.accessToken,
  });

  return {
    item: redactItem(item),
    accounts: response.data.accounts,
    itemMetadata: response.data.item,
    requestId: response.data.request_id,
  };
}
