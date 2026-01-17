import { createCerebras } from '@ai-sdk/cerebras';

export const cerebrasProvider = createCerebras({
    apiKey: process.env.CEREBRAS_API_KEY ?? '',
});