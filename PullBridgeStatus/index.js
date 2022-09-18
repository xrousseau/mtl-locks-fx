const axios = require("axios");
const cheerio = require("cheerio");
const https = require("https");
const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
require('dotenv').config()


module.exports = async function (context, myTimer) {
    
    const bigVal = 99999999999999; // Hack to generate a decrementing rowKey. To keep the latest status top of the list in the Az Table.
    const rowKey = (bigVal - new Date().YYYYMMDDHHMMSS()).toString();

    try {
        const httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });

        const { data } = await axios.get(process.env.URL, {httpsAgent});
        const $ = cheerio.load(data);
        
        const htmlElements = $("#grey_box"); // 3 html element should always be returned. One for each passage/bridge.

        htmlElements.each(async (idx, el) => {
            // Is assumed to be always in the same order. We use the index for partitioning (by passage/bridge). This will need to be revisited to make it more robust.
            const status = {PartitionKey : ("M" + idx), RowKey : rowKey, passageName : null, isOpened : null, closedSince: null, expectedNextClosure : null, openedMinutesRemaining : 0, extraInfo : null};

            status.passageName = $("span.lgtextblack", el).text();
            
            const info = $("#status",el).text();
            status.isOpened = isOpened(info);
            status.extraInfo = getExtraInfo(info);
            status.closedSince = getClosedSince(status.extraInfo);
            
            if (status.isOpened) {
                status.expectedNextClosure = getNextClosure($("span.lgtextblack10", el).text());
                status.openedMinutesRemaining = getOpenedTimeRemaining(status.expectedNextClosure);
            }

            insertStatus(status);
        });

    } catch (err) {
        context.log.error(err);
    }    

    context.log.info('JavaScript timer trigger function ran!');   
};

const isOpened = (input) => {
    return input.startsWith("Available");
};

const getExtraInfo = (input) => {
    // get extra info between parenthesis
    const matches = input.match(/\(([^)]+)\)/);
    if (matches) {
        return matches[1];
    }
}

const getClosedSince = (input) => {
    if (input && input.includes("Fully Raised since"))
        return input.substring(19);
};

const getNextClosure = (input) => {
    let output = input.substring(14); 
    if (output == "----") return;

    return output;
};

Date.prototype.YYYYMMDDHHMMSS = (date = new Date()) => {
    const padTo2Digits = (num) => {
        return num.toString().padStart(2, '0');
    }
    
    return parseInt([      
        date.getUTCFullYear(),
        padTo2Digits(date.getUTCMonth() + 1),
        padTo2Digits(date.getUTCDate()),
        padTo2Digits(date.getUTCHours()),
        padTo2Digits(date.getUTCMinutes()),
        padTo2Digits(date.getUTCSeconds())
    ].join(''));
};

const getOpenedTimeRemaining = (nextClosureTime) => {
    if (!nextClosureTime) return 60;

    const nextClosureDateTime = new Date();

    const closureTimeMinHour = nextClosureTime.split(':');
    nextClosureDateTime.setHours(closureTimeMinHour[0]);
    nextClosureDateTime.setMinutes(closureTimeMinHour[1]);

    // check if time is in the past
    if (nextClosureDateTime < new Date()) return 0;

    const timeOpened = getMinDiff(new Date(), nextClosureDateTime);
    return timeOpened;
};

const getMinDiff = (startDate, endDate) => {
    const msInMinute = 60 * 1000;
  
    return Math.round(
      Math.abs(endDate - startDate) / msInMinute
    );
};

const insertStatus = async (status) => {
    const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    const tableName = process.env.AZURE_STORAGE_TABLE_NAME;

    const credential = new AzureNamedKeyCredential(account, accountKey);
    const client = new TableClient(`https://${account}.table.core.windows.net`, tableName, credential);
    await client.createTable();
    await client.createEntity(status);
};
