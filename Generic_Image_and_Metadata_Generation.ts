import Jimp from 'jimp';
import Airtable from 'airtable';
import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';
import FormData from 'form-data';

dotenv.config();

// load environment var
const API_KEY = process.env['AIRTABLE_API_KEY'];
const BASE_ID = process.env['AIRTABLE_BASE_ID'];
const TABLE_NAME = process.env['AIRTABLE_TABLE_NAME'];

const PINATA_API_KEY = process.env['PINATA_API_KEY'];
const PINATA_SECRET_API_KEY = process.env['PINATA_SECRET_API_KEY'];


const base = new Airtable({ apiKey: API_KEY }).base(BASE_ID);

// upload img to pinata func
async function uploadToPinata(imageBuffer, filename) {
    try {
        const url = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
        const data = new FormData();
        data.append('file', imageBuffer, filename);

        const response = await axios.post(url, data, {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
                'pinata_api_key': PINATA_API_KEY,
                'pinata_secret_api_key': PINATA_SECRET_API_KEY,
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        if (response.status === 200) {
            return `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`;
        } else {
            throw new Error(`Failed to upload image to Pinata: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error uploading to Pinata:', error);
        throw error;
    }
}

// upload metadata (json) to pinata func
async function uploadJsonToPinata(jsonData, filename) {
    try {
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
            return `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`;
        } else {
            throw new Error(`Failed to upload JSON to Pinata: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error uploading JSON to Pinata:', error);
        throw error;
    }
}

// jamie's random touch??
function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');
}

// fetch airtable records
async function fetchRecords() {
    try {
        const records = [];
        console.log('Fetching records...');

        await base(TABLE_NAME)
            .select({
                filterByFormula: `
                    AND(
                        {Certificate Status} = 'Generate Image',
                        {Achievement level} != '',
                        {Certificate ID} != ''
                    )
                `,
            })
            .eachPage((pageRecords, fetchNextPage) => {
                records.push(...pageRecords);
                fetchNextPage();
            });

        console.log(`Fetched ${records.length} records.`);
        return records;
    } catch (error) {
        console.error('Error fetching records:', error);
        throw error;
    }
}
// kek non-rigerous error handling for this one :P
async function processRecord(record) {
    try {
        const fields = record.fields;

        const recordId = fields['RecordID'];
        const achievementLevel = fields['Achievement level'];
        const programmeName = Array.isArray(fields['Programme name (from 📺 Programmes)'])
            ? fields['Programme name (from 📺 Programmes)'][0]
            : fields['Programme name (from 📺 Programmes)'];
        const certificateImageURL = fields['Certificate image (from 📺 Programmes)'][0].url;
        const certificateId = fields['Certificate ID'];

        console.log(`Processing: ${achievementLevel}, ${programmeName}, Certificate ID: ${certificateId}`);

        // download certificate image - also a jamie issue, i think this is suboptimal but its nice to have diversity
        const response = await axios.get(certificateImageURL, { responseType: 'arraybuffer' });
        const background = await Jimp.read(Buffer.from(response.data));

        // load fonts
        const fontBold = await Jimp.loadFont('./fonts/Montserrat-SemiBold.fnt');
        const fontRegular = await Jimp.loadFont('./fonts/Montserrat-Regular.fnt');

        // Image processing logic
        const { width, height } = background.bitmap;
        const margin = 80;

        // Programme Name
        const programmeNameY = height * 0.875;
        const wrappedProgrammeName = wrapText(programmeName.toUpperCase(), fontBold, width * 0.8);
        background.print(
            fontBold,
            margin,
            programmeNameY,
            { text: wrappedProgrammeName, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT },
            width - margin * 2
        );

        // Achievement Level
        const achievementLevelY = programmeNameY - 150;
        background.print(
            fontRegular,
            margin,
            achievementLevelY,
            { text: achievementLevel.toUpperCase(), alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT },
            width - margin * 2
        );

        // Certificate ID
        const certificateIdText = `# ${certificateId}`;
        const certificateIdY = height - 110;
        const certificateIdX = width - Jimp.measureText(fontBold, certificateIdText) - margin;
        background.print(
            fontBold,
            certificateIdX,
            certificateIdY,
            { text: certificateIdText },
            width - margin * 2
        );

        // save image locally... -.-
        const imagePath = `./${recordId}.png`;
        await background.writeAsync(imagePath);

        // upload to Pinata
        const imageBuffer = fs.readFileSync(imagePath);
        const ipfsImageUrl = await uploadToPinata(imageBuffer, `${recordId}.png`);

        console.log(`Uploaded to Pinata: ${ipfsImageUrl}`);

        // assemble metadata
        const metadata = {
            name: `Encode Certificate #${certificateId}`,
            description: "This NFT represents your participation and achievement in an Encode Club programme.",
            image: ipfsImageUrl,
            attributes: [
                { trait_type: "Programme Name", value: programmeName },
                { trait_type: "Achievement Level", value: achievementLevel },
                { trait_type: "Certificate ID", value: certificateId },
            ],
        };

        // upload metadata to Pinata
        const ipfsMetadataUrl = await uploadJsonToPinata(metadata, `${recordId}_metadata.json`);
        console.log(`Uploaded metadata to Pinata: ${ipfsMetadataUrl}`);

        // update hairtable accordingly
        await base(TABLE_NAME).update(record.id, {
            'IPFS Image': ipfsImageUrl,
            'IPFS Metadata': ipfsMetadataUrl,
            'Certificate Status': 'Image Generated',
        });

        console.log(`Updated Airtable for record ${recordId}.`);

        // delete jamie's sloppy local image file
        fs.unlinkSync(imagePath);
        console.log(`Deleted local image file: ${imagePath}`);
    } catch (error) {
        console.error(`Error processing record ${record.id}:`, error);

        // update Airtable in case of error
        await base(TABLE_NAME).update(record.id, {
            'Certificate Status': 'Error',
        });
    }
}

// elper func for text wrapping
function wrapText(text, font, maxWidth) {
    const words = text.split(' ');
    let currentLine = '';
    let result = '';

    for (const word of words) {
        const testLine = `${currentLine} ${word}`.trim();
        const textWidth = Jimp.measureText(font, testLine);
        if (textWidth <= maxWidth) {
            currentLine = testLine;
        } else {
            result += `${currentLine}\n`;
            currentLine = word;
        }
    }

    if (currentLine) result += currentLine;
    return result.trim();
}

// main function
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
