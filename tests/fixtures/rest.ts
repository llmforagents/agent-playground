export const fxHealthz = {
  status: 'ok', service: 'llm-proxy', timestamp: '2026-04-17T19:00:00Z',
}

export const fxRegisterAgent = {
  uuid: '11111111-1111-4111-8111-111111111111',
  apiKey: 'sk_test_abc',
  name: 'My Agent',
  createdAt: '2026-04-17T19:00:00Z',
}

export const fxBalance = {
  availableUsdCents: 500,
  totalDepositedUsd: 5,
  totalSpentUsd: 0,
}

export const fxWallet = {
  chain: 'solana',
  token: 'USDC',
  address: '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2',
  createdAt: '2026-04-17T19:00:00Z',
}

export const fxModels = {
  models: [
    {
      slug: 'gemini-2.5-flash-lite',
      displayName: 'Gemini 2.5 Flash Lite',
      provider: 'Google',
      feePct: 20,
      inputPricePer1M: 0.1,
      outputPricePer1M: 0.4,
      contextWindow: 1000000,
      lastSyncedAt: '2026-04-17 18:00:00',
    },
  ],
  feePct: 20,
  requestId: 'req_test',
}

export const fxChatCompletion = {
  id: 'chatcmpl_1',
  object: 'chat.completion',
  created: 1700000000,
  model: 'gemini-2.5-flash-lite',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'Hello!' },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
}

export const fxTransactions = {
  transactions: [{
    id: 1,
    type: 'deposit',
    amountUsdCents: 500,
    model: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    chain: 'solana',
    txHash: '2nUBn9rEnDh',
    description: 'Deposit of 5.00 USDC on solana',
    createdAt: '2026-04-17 19:00:00',
  }],
  total: 1,
  limit: 50,
  offset: 0,
  requestId: 'req_test',
}
