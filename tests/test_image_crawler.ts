import { fetchPOIImage } from './src/services/imageCrawler';

async function main() {
  const url = await fetchPOIImage('故宫', '北京', 39.916345, 116.397155);
  console.log("Result URL:", url);
}

main().catch(console.error);
