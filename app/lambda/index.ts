import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({})
);
  
  const RESULTS_TABLE = process.env.RESULTS_TABLE_NAME!;
  const EVENTS_TABLE = process.env.EVENTS_TABLE_NAME!;


interface Message {
    eventId: string,
    bib: string,
    lane: number,
    revision: number,
    status: string,
    timeMs: number,
    recordedAt: string
}

interface Result {
  bib: string,
  lane: number,
  revision: number,
  status: string,
  timeMs: number
}

async function getLastestRevision(bib: string) : Promise<Result | null>  {
  const bibResult = await client.send(
    new QueryCommand({
      TableName: RESULTS_TABLE!,
      KeyConditionExpression: "#bib = :bib",

      ExpressionAttributeNames: {
        "#bib": "bib",
      },

      ExpressionAttributeValues: {
        ":bib": bib,
      },
      ScanIndexForward: false,
      Limit: 1,
    })
  );

  return (bibResult.Items?.[0] as Result) ?? null;
}

async function createNewRecord(record: Message) : Promise<void>  {
  const newRecord: Result = {
    bib: record.bib,
    lane: record.lane,
    revision: record.revision,
    status: record.status,
    timeMs: record.timeMs
  };

  await client.send(
    new PutCommand({
      TableName: RESULTS_TABLE,
      Item: newRecord,
    })
  );
}

async function updateRecord(record: Message, latestRevisionNumber: number) : Promise<void>  {
  // Possible doubt: Would it exist a scenario with same bib but different lane? Would it mean corrupt?
  await client.send(
    new UpdateCommand({
      TableName: RESULTS_TABLE,

      Key: {
        id: record.bib,
        revision: latestRevisionNumber,
      },
      UpdateExpression:
        "SET #revision = :revision, #status = :status, #timeMs = :timeMs",

      ExpressionAttributeNames: {
        "#revision": "revision",
        "#status": "status",
        "#timeMs": "timeMs",
      },

      ExpressionAttributeValues: {
        ":revision": record.revision,
        ":status": record.status,
        ":timeMs": record.timeMs,
      },
    })
  );
}

exports.handler = async (event: Message) => {

    const lastestRevision = await getLastestRevision(event.bib);
    
    // If there is no record this is the first record for this athlete 
    if(!lastestRevision){
      try{
        await createNewRecord(event);
        return;
      } catch (e: any){
        console.log("Throw error of API and log unprocessed")
      }
    }

    if(lastestRevision!.revision >= event.revision){
      console.log("Ignored -- to do: include log and stats")
      return
    }

    await updateRecord(event, lastestRevision!.revision)

    return {
        statusCode: 200,
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ message: "Working" }),
    };
};