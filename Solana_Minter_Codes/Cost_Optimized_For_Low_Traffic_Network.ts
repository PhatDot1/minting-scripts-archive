import Airtable from 'airtable';
import axios from 'axios';
import FormData from 'form-data';
import sgMail from '@sendgrid/mail';
import fs from 'fs';
import path from 'path';
import Jimp from 'jimp';
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { Metaplex, keypairIdentity, toBigNumber, DefaultCandyGuardSettings, CreateCandyMachineInput } from "@metaplex-foundation/js";

// Constants and configurations
const AIRTABLE_API_KEY = '1';
const BASE_ID = '2';
const TABLE_NAME = '3';
const IMGUR_CLIENT_ID = '4';
const SENDGRID_API_KEY = '5';
const PINATA_API_KEY = '6';
const PINATA_SECRET_API_KEY = '7';
const FONT_PATH_MONTSERRAT_REGULAR = path.join(__dirname, 'fonts', 'Montserrat-Regular.fnt');
const FONT_PATH_MONTSERRAT_SEMIBOLD = path.join(__dirname, 'fonts', 'Montserrat-SemiBold.fnt');
const QUICKNODE_RPC = '8';
const SECRET_KEY_PATH = '9'; 
const COLLECTION_NFT_MINT = '10';

const screen_positions = require('./enums'); // Using require to import CommonJS module

// Initialize Airtable client
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(BASE_ID);

// Initialize Solana connection and Metaplex
const SOLANA_CONNECTION = new Connection(QUICKNODE_RPC, { commitment: 'finalized' });
const secretKey = JSON.parse(fs.readFileSync(path.resolve(SECRET_KEY_PATH), 'utf8'));
const WALLET = Keypair.fromSecretKey(new Uint8Array(secretKey));
const METAPLEX = Metaplex.make(SOLANA_CONNECTION).use(keypairIdentity(WALLET));

// Airtable and Pinata related types
interface Attachment {
    id: string;
    url: string;
    filename: string;
    size: number;
    type: string;
    thumbnails: {
        small: { url: string; width: number; height: number };
        large: { url: string; width: number; height: number };
        full: { url: string; width: number; height: number };
    };
}

interface AirtableFields {
    'Certificate image (from 📺 Programmes)': Attachment[];
    'Programme name (from 📺 Programmes)': string[];
    'Achievement level': string;
    'ETH address (from ☃️ People)': string;
    'Email (from ☃️ People)': string;
    'Certificate ID': string;
    'Type (from 📺 Programmes)': string[];
    'Patrick Temp Image'?: string;
    'IPFS Image'?: string;
    'IPFS Metadata'?: string;
    'Link to NFT'?: string;
}

interface AirtableRecord {
    id: string;
    fields: AirtableFields;
}

interface PinataResponse {
    IpfsHash: string;
}

interface ImgurResponse {
    data: { link: string };
}

// Function to clean programme name
function cleanProgrammeName(programmeName: string): string {
    const sponsorIndex = programmeName.toLowerCase().indexOf('sponsored by');
    if (sponsorIndex !== -1) {
        return programmeName.substring(0, sponsorIndex).trim();
    }
    return programmeName;
}

// Fetch records from Airtable
async function fetchAirtableRecords(): Promise<AirtableRecord[]> {
    const records: AirtableRecord[] = [];
    await base(TABLE_NAME).select({
        filterByFormula: "AND({Certificate Status}='Ready Sol', {📜 PDF/NFT Certificate Preferences (from ☃️ People)}='NFT')"
    }).eachPage((pageRecords, fetchNextPage) => {
        records.push(...pageRecords.map(record => ({
            id: record.id,
            fields: record.fields as unknown as AirtableFields,
        })));
        fetchNextPage();
    });
    return records;
}

// Function to upload image to Pinata
async function uploadToPinata(imageBuffer: Buffer, filename: string): Promise<string> {
    const url = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
    const data = new FormData();
    data.append('file', imageBuffer, filename);

    const response = await axios.post(url, data, {
        headers: {
            ...data.getHeaders(),
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_API_KEY,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    if (response.status === 200) {
        return `https://ipfs.io/ipfs/${response.data.IpfsHash}`;
    } else {
        throw new Error(`Failed to upload image to Pinata: ${response.statusText}`);
    }
}

// Function to upload JSON metadata to Pinata
async function uploadJsonToPinata(jsonData: any, filename: string): Promise<string> {
    const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
    const response = await axios.post(url, {
        pinataContent: jsonData,
        pinataMetadata: { name: filename }
    }, {
        headers: {
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_API_KEY,
            'Content-Type': 'application/json'
        }
    });

    if (response.status === 200) {
        return `https://ipfs.io/ipfs/${response.data.IpfsHash}`;
    } else {
        throw new Error(`Failed to upload JSON to Pinata: ${response.statusText}`);
    }
}

// Function to print text at position
function printTextAtPosition(
    font: any,
    text: string,
    image: Jimp,
    position: number,
    margin: number,
    maxWidth: number,
    xOffset: number,
    yOffset: number
) {
    const messageWidth = Jimp.measureText(font, text);
    const messageHeight = Jimp.measureTextHeight(font, text, maxWidth);

    let positionX: number;
    let positionY: number;

    switch (position) {
        case screen_positions.LeftTop:
            positionX = 0 + margin + xOffset;
            positionY = 0 + margin + yOffset;
            break;
        case screen_positions.MiddleTop:
            positionX = image.bitmap.width / 2 - messageWidth / 2 + xOffset;
            positionY = 0 + margin + yOffset;
            break;
        case screen_positions.RightTop:
            positionX = image.bitmap.width - messageWidth - margin + xOffset;
            positionY = 0 + margin + yOffset;
            break;
        case screen_positions.LeftMiddle:
            positionX = 0 + margin + xOffset;
            positionY = image.bitmap.height / 2 - messageHeight / 2 + yOffset;
            break;
        case screen_positions.MiddleMiddle:
            positionX = image.bitmap.width / 2 - messageWidth / 2 + xOffset;
            positionY = image.bitmap.height / 2 - messageHeight / 2 + yOffset;
            break;
        case screen_positions.RightMiddle:
            positionX = image.bitmap.width - messageWidth - margin + xOffset;
            positionY = image.bitmap.height / 2 - messageHeight / 2 + yOffset;
            break;
        case screen_positions.LeftBottom:
            positionX = 0 + margin + xOffset;
            positionY = image.bitmap.height - messageHeight - margin + yOffset;
            break;
        case screen_positions.MiddleBottom:
            positionX = image.bitmap.width / 2 - messageWidth / 2 + xOffset;
            positionY = image.bitmap.height - messageHeight - margin + yOffset;
            break;
        case screen_positions.RightBottom:
            positionX = image.bitmap.width - messageWidth - margin + xOffset;
            positionY = image.bitmap.height - messageHeight - margin + yOffset;
            break;
        default:
            positionX = 0;
            positionY = 0;
            break;
    }

    image.print(
        font,
        positionX,
        positionY,
        {
            text: text,
        },
        maxWidth,
        image.bitmap.height
    );
}

function getCertificateIdForUri(uri: string, records: AirtableRecord[]): string {
    for (const record of records) {
        if (record.fields['IPFS Metadata'] === uri) {
            return record.fields['Certificate ID'];
        }
    }
    return '';
}

// Function to create and load the Candy Machine
async function createAndLoadCandyMachine(metadataUris: string[], records: AirtableRecord[]): Promise<string | undefined> {
    try {
        const candyMachineSettings: CreateCandyMachineInput<DefaultCandyGuardSettings> = {
            itemsAvailable: toBigNumber(metadataUris.length),
            sellerFeeBasisPoints: 1000,
            symbol: "Encode",
            maxEditionSupply: toBigNumber(0),
            isMutable: true,
            creators: [
                { address: WALLET.publicKey, share: 100 },
            ],
            collection: {
                address: new PublicKey(COLLECTION_NFT_MINT),
                updateAuthority: WALLET,
            },
        };

        const { candyMachine } = await METAPLEX.candyMachines().create(candyMachineSettings);
        const candyMachineId = candyMachine.address.toString();
        console.log(`✅ - Created Candy Machine: ${candyMachineId}`);
        console.log(`     https://explorer.solana.com/address/${candyMachineId}?cluster=mainnet-beta`);

        const items = metadataUris.map((uri, index) => {
            const certificateId = getCertificateIdForUri(uri, records);
            return {
                name: `Encode Certificate #${certificateId}`,
                uri: uri
            };
        });

        const { response } = await METAPLEX.candyMachines().insertItems({
            candyMachine,
            items: items,
        }, { commitment: 'finalized' });

        console.log(`✅ - Items added to Candy Machine: ${candyMachineId}`);
        console.log(`     https://explorer.solana.com/tx/${response.signature}?cluster=mainnet-beta`);

        return candyMachineId;
    } catch (error) {
        console.error('Error creating and loading Candy Machine:', error);
        if (error instanceof Error && 'logs' in error) {
            console.error('Transaction Logs:', (error as any).logs);
        }
    }
}

// Function to mint NFTs
async function mintNfts(candyMachineId: string, records: AirtableRecord[]): Promise<void> {
    try {
        const candyMachine = await METAPLEX.candyMachines().findByAddress({ address: new PublicKey(candyMachineId) });

        for (let i = 0; i < records.length; i++) {
            const { nft, response } = await METAPLEX.candyMachines().mint({
                candyMachine,
                collectionUpdateAuthority: WALLET.publicKey,
            }, { commitment: 'finalized' });

            console.log(`✅ - Minted NFT: ${nft.address.toString()}`);
            console.log(`     https://explorer.solana.com/address/${nft.address.toString()}?cluster=mainnet-beta`);
            console.log(`     https://explorer.solana.com/tx/${response.signature}?cluster=mainnet-beta`);

            const nftPreviewLink = `https://solscan.io/token/${nft.address.toString()}?cluster=mainnet-beta`;

            await base(TABLE_NAME).update(records[i].id, {
                'Link to NFT': nftPreviewLink
            });

            // Transfer NFT and update status
            const receiverAddress = records[i].fields['ETH address (from ☃️ People)'];
            const toPublicKey = new PublicKey(receiverAddress);

            try {
                const signature = await transferNFT(nft.address.toString(), toPublicKey);

                await base(TABLE_NAME).update(records[i].id, {
                    'TXN': `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`,
                    'Certificate Status': 'Success'
                });

                await sendEmail(
                    records[i].fields['Email (from ☃️ People)'],
                    records[i].fields['Programme name (from 📺 Programmes)'][0],
                    records[i].fields['Programme name (from 📺 Programmes)'][0], // Placeholder for receiver name
                    `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`,
                    receiverAddress
                );
            } catch (transferError) {
                console.error(`Error transferring NFT for ${records[i].fields['Email (from ☃️ People)']}:`, transferError);
                await base(TABLE_NAME).update(records[i].id, { 'Certificate Status': 'Error' });
            }
        }
    } catch (error) {
        console.error('Error minting NFT:', error);
        if (error instanceof Error && 'logs' in error) {
            console.error('Transaction Logs:', (error as any).logs);
        }
    }
}

// Function to send email using SendGrid
async function sendEmail(
    toEmailAddress: string,
    programmeName: string,
    receiverName: string,
    etherscanLinkToTx: string,
    solanaAddress: string
) {
    const emailRegexp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegexp.test(toEmailAddress)) {
        const subjectText = `Your NFT for ${programmeName}`;

        const receiverFirstName = receiverName.split(" ")[0];

        const htmlText = `<div>
      <div>Hey ${receiverFirstName},<br></div><br>
      <div>🎉 Congratulations on completing the ${programmeName}.<br></div><br>
      <div>💌 We have just sent you a special NFT certificate for participating in the programme. You can view it on <a href="${etherscanLinkToTx}" target="_blank">${solanaAddress}</a>. <br></div><br>
      <div>📢 Now show off your achievement! Having a great Twitter profile helps you stand out in crypto!<b> So tweet out your NFT</b>, be sure to tag <a href="https://twitter.com/encodeclub" target="_blank">@encodeclub</a> and we'll retweet. <br></div><br>
      <div>📜 You can also add this to your LinkedIn as a certificate to show off to future employers! Here is a short <a href="https://encodeclub.notion.site/Encode-Club-NFT-Certificate-Guide-4b0264ba5bc84fa3bf2c2b3bd7b940f4" target="_blank">guide</a> on how to do that. <br></div><br>
      <div>We hope to see you soon!<br></div>
      <div>Encode Club</div>
    </div>`;

        const sendEmailUrl = 'https://api.sendgrid.com/v3/mail/send';

        const msg = {
            personalizations: [{ to: [{ email: toEmailAddress }] }],
            from: { email: 'nfts@encode.club' },
            subject: subjectText,
            content: [{ type: 'text/html', value: htmlText }],
        };

        try {
            const response = await axios.post(sendEmailUrl, msg, {
                headers: {
                    Authorization: `Bearer ${SENDGRID_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            });

            console.log('Email sent successfully:', response.data);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('Error sending email:', error.response?.data || error.message);
            } else {
                console.error('Unknown error sending email:', (error as Error).message);
            }
        }
    } else {
        console.error(`Error - Email address not valid: ${toEmailAddress}`);
    }
}

// Function to transfer NFT using the Token Program
const transferNFT = async (nftMintAddress: string, toPublicKey: PublicKey): Promise<string> => {
    const nft = await METAPLEX.nfts().findByMint({ mintAddress: new PublicKey(nftMintAddress) });
    if (!nft) {
        throw new Error(`NFT with mint address ${nftMintAddress} not found`);
    }

    const { blockhash, lastValidBlockHeight } = await SOLANA_CONNECTION.getLatestBlockhash();

    const transactionBuilder = await METAPLEX.nfts().builders().transfer({
        nftOrSft: nft,
        toOwner: toPublicKey,
        authority: WALLET,
    });

    const transaction = transactionBuilder.toTransaction({
        blockhash,
        lastValidBlockHeight,
    });
    transaction.feePayer = WALLET.publicKey;

    const signature = await sendAndConfirmTransaction(SOLANA_CONNECTION, transaction, [WALLET]);
    console.log(`✅ - Transferred NFT to ${toPublicKey.toString()}`);
    console.log(`     Transaction: https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`);

    // Log the details of the transaction to verify
    console.log(`Transaction details: NFT Mint Address: ${nftMintAddress}, To Public Key: ${toPublicKey.toString()}, Signature: ${signature}`);

    return signature;
};

// Main processing function
async function processRecords() {
    try {
        const records = await fetchAirtableRecords();
        const nftMetadataUris: string[] = [];

        for (const record of records) {
            try {
                const fields = record.fields;
                console.log(`Processing record ID: ${record.id}`);

                const imageField = fields['Certificate image (from 📺 Programmes)'];
                const programmeName = cleanProgrammeName(fields['Programme name (from 📺 Programmes)']?.[0]);
                const text2 = fields['Achievement level'];
                const receiverAddress = fields['ETH address (from ☃️ People)'];
                const toEmail = fields['Email (from ☃️ People)'];
                const certificateId = fields['Certificate ID'];
                const programmeType = fields['Type (from 📺 Programmes)']?.[0] || 'N/A';

                if (!imageField || !programmeName || !text2 || !receiverAddress || !toEmail || !certificateId) {
                    throw new Error("Missing required fields");
                }

                const imageUrl = imageField[0].url;

                console.log(`Image URL: ${imageUrl}`);
                console.log(`Programme name: ${programmeName}`);
                console.log(`Achievement level: ${text2}`);
                console.log(`Receiver address: ${receiverAddress}`);
                console.log(`Email: ${toEmail}`);
                console.log(`Certificate ID: ${certificateId}`);
                console.log(`Programme type: ${programmeType}`);

                const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(imageResponse.data);
                const image = await Jimp.read(imageBuffer);

                const fontMontserratRegular = await Jimp.loadFont(FONT_PATH_MONTSERRAT_REGULAR);
                const fontMontserratSemiBold = await Jimp.loadFont(FONT_PATH_MONTSERRAT_SEMIBOLD);
                const margin = 80;

                await printTextAtPosition(
                    fontMontserratSemiBold,
                    programmeName.toUpperCase(),
                    image,
                    screen_positions.LeftBottom,
                    margin,
                    image.bitmap.width / 2,
                    0,
                    0
                );
                await printTextAtPosition(
                    fontMontserratRegular,
                    text2.toUpperCase(),
                    image,
                    screen_positions.LeftMiddle,
                    margin,
                    image.bitmap.width,
                    0,
                    margin * 3.5
                );
                await printTextAtPosition(
                    fontMontserratSemiBold,
                    `# ${certificateId}`,
                    image,
                    screen_positions.RightBottom,
                    margin,
                    image.bitmap.width / 2,
                    0,
                    0
                );

                const outputImageBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

                const pinataImageFilename = `NFT_to_pin_${certificateId}.jpg`;
                const pinataImageLink = await uploadToPinata(outputImageBuffer, pinataImageFilename);
                console.log(`Image uploaded to Pinata with link: ${pinataImageLink}`);

                const metadata = {
                    name: `Encode Certificate #${certificateId}`,
                    description: "This NFT represents your participation and achievement in an Encode Club programme. Encode Club is a web3 education community helping you learn, build and take your next career step. Congratulations on your efforts, this NFT is a testament to you and your contribution to the community.",
                    image: pinataImageLink,
                    attributes: [
                        { trait_type: "Programme Type", value: programmeType },
                        { trait_type: "Programme Name", value: programmeName },
                        { trait_type: "Accreditation Level", value: text2 }
                    ]
                };
                const pinataJsonFilename = `Encode_Certificate_${certificateId}.json`;
                const pinataJsonLink = await uploadJsonToPinata(metadata, pinataJsonFilename);
                console.log(`Metadata JSON uploaded to Pinata with link: ${pinataJsonLink}`);

                nftMetadataUris.push(pinataJsonLink);

                await base(TABLE_NAME).update(record.id, {
                    'Patrick Temp Image': pinataImageLink,
                    'IPFS Image': pinataImageLink,
                    'IPFS Metadata': pinataJsonLink
                });

            } catch (error) {
                console.error(`Error processing record ${record.id}:`, error);
            }
        }

        const candyMachineId = await createAndLoadCandyMachine(nftMetadataUris, records);
        if (candyMachineId) {
            await mintNfts(candyMachineId, records);
        }

    } catch (error) {
        console.error("Error fetching Airtable records:", error);
    }
}


// Start the process
processRecords();