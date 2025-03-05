const axios = require('axios');
const hre = require("hardhat");
const Airtable = require('airtable');

// Pinata API keys
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;

// Setup Airtable
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// fetch airtable records where Certificate Status = 'Mint Poly'
async function fetchRecords() {
  try {
    const records = [];
    console.log('Fetching records...');

    await base(AIRTABLE_TABLE_NAME)
      .select({
        filterByFormula: `{Certificate Status} = 'Mint Poly'`
      })
      .eachPage((pageRecords, fetchNextPage) => {
        records.push(...pageRecords);
        fetchNextPage();
      });

    console.log(`Fetched ${records.length} records.`);
    return records;
  } catch (error) {
    console.error('Error fetching records:', error);
    throw error; // kek non-rigerous error handling for this one :P
  }
}

// mint nft from metadata IPFS URL
async function mintNFT(metadataIpfsUrl) {
  const contractAddress = '0x236B54bd3A9D8ad8aEa3C05b56e9d1265dA3cD5F'; // Your deployed contract address
  const ArbitrumNFTMinter = await hre.ethers.getContractFactory('PPPolygonEncodeMinterADV');
  const contract = await ArbitrumNFTMinter.attach(contractAddress);

  const quantity = 1; // mint one NFT
  const tx = await contract.mint(quantity, metadataIpfsUrl);
  const receipt = await tx.wait();

  const tokenId = receipt.events[0].args.tokenId.toString(); // Get the minted token ID
  console.log('NFT minted successfully with tokenId:', tokenId);

  // generate the Arbiscan URL for the minted NFT
  const nftUrl = `https://amoy.polygonscan.com/nft/${contractAddress}/${tokenId}`;
  console.log(`View the minted NFT here: ${nftUrl}`);
  return tokenId;
}

// process record from Airtable and mint NFT
async function processRecord(record) {
  try {
    const fields = record.fields;
    const ipfsImageUrl = fields['IPFS Image']; // The URL for the image uploaded to IPFS
    const ipfsMetadataUrl = fields['IPFS Metadata']; // The URL for the metadata uploaded to IPFS
    const recordId = fields['RecordID'];

    console.log(`Processing record ${recordId}...`);

    // Step 1: Get metadata from IPFS URL
    const metadataResponse = await axios.get(ipfsMetadataUrl);
    const metadata = metadataResponse.data;

    // make sure the image URL in the metadata is the correct one
    metadata.image = ipfsImageUrl; // update image field in metadata if needed

    // Step 2: Mint the NFT with the full metadata URI
    const metadataIpfsUrl = ipfsMetadataUrl; // metadata already uploaded to IPFS
    const tokenId = await mintNFT(metadataIpfsUrl);

    // Step 3: Update Airtable with the minted tokenId and change the status to 'Minted Poly'
    await base(AIRTABLE_TABLE_NAME).update(record.id, {
      'Certificate Status': 'Minted Poly',
      'Token ID': tokenId
    });
    console.log(`Record ${recordId} updated to 'Minted Poly'`);
  } catch (error) {
    console.error(`Error processing record ${record.id}:`, error);
    // update Airtable status to 'Error' in case of failure
    await base(AIRTABLE_TABLE_NAME).update(record.id, {
      'Certificate Status': 'Error'
    });
  }
}

// main func
async function main() {
  try {
    const records = await fetchRecords();
    for (const record of records) {
      await processRecord(record);
    }
  } catch (error) {
    console.error('Error in main execution:', error);
  }
}

main();