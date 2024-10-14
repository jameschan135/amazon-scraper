/* eslint-disable no-restricted-globals */
import { getAmazonProductInfo } from '../utils/amazonScraper';

self.onmessage = async (event) => {
  const { asinOrUrl, apiKey } = event.data;
  try {
    const info = await getAmazonProductInfo(asinOrUrl, null, apiKey);
    self.postMessage({ type: 'success', asinOrUrl, info });
  } catch (error) {
    self.postMessage({ type: 'error', asinOrUrl, error: error.message });
  }
};
