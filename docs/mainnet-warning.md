# Mainnet Warning — Testing Procedure

This dashboard talks to the **production** llm4agents API against **mainnet** wallets.

## Before testing

1. Start the dashboard (`npm run dev`) and register an agent in `/agents`.
2. In `/wallet`, generate a deposit wallet (Solana or Polygon, USDC or USDT).
3. Make a **real deposit** of a small amount (e.g., $5) to the generated address.
4. Return to `/wallet` and hit "Refresh" until the balance is credited.
5. Only then is `/chat` enabled.

## Default guardrails

- Chat completions default to **gemini-2.5-flash-lite** (cheapest).
- Selecting a more expensive model pops a confirmation dialog.
- No automatic retries for chat completions — manual only.
- No background polling on paid endpoints.

## Do NOT

- Leave automatic retries / polling enabled anywhere in the code.
- Ship changes that default to a more expensive model.
- Commit `.env.local` (already gitignored).
- Share your API key; it is stored in this browser only.
