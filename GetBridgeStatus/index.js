const { TableClient, AzureNamedKeyCredential, odata } = require("@azure/data-tables");

module.exports = async function (context, req) {
    const bridgeId = req.query.id;

    // pre-condition
    if (!bridgeId) {
        context.res = {
            status: 400,
            headers: {Detail : 'Missing parameter or value for parameter "id" in querystring'}
        };
        return;
    }

    // get latest available status from AZ Table
    const responseMessage = await getLastestStatus(bridgeId);

    if (responseMessage) 
    {
        // convert to readable local time
        responseMessage.timestamp = new Date(responseMessage.timestamp).toLocaleString()

        context.res = {
            body: responseMessage
        };
    } 
    else {
        context.res = {
            status: 404,
            headers: {Detail : `No status found for id="${bridgeId}"`}
        };
    }
}


const getLastestStatus = async (partitionKey) => {
    const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    const tableName = "events";

    const credential = new AzureNamedKeyCredential(account, accountKey);
    const client = new TableClient(`https://${account}.table.core.windows.net`, tableName, credential);

    const entities = client.listEntities(
        {queryOptions: {
            filter: odata`PartitionKey eq '${partitionKey}'`
        }});

    const iterator = entities.byPage({ maxPageSize: 1 }); //limit page size to one
    for await (const page of iterator) {
        return page[0];
    }
};