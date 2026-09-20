import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand
} from "@aws-sdk/lib-dynamodb";
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({})
);
  
  const RESULTS_TABLE = process.env.RESULTS_TABLE_NAME!;
  const EVENTS_TABLE = process.env.EVENTS_TABLE_NAME!;


interface Message {
    eventId: string | null,
    bib: string | null,
    lane: number | null,
    revision: number | null,
    status: string | null,
    timeMs: number | null,
    recordedAt: string | null
}

interface Result {
  eventId: string,
  bib: string,
  lane: number,
  revision: number,
  status: string,
  timeMs: number
}

interface Stats {
  eventId: string,
  athletesTracked: number,
  updatesAccepted: number,
  updatesIgnored:  number
}

async function getLastestRevision(bib: string) : Promise<Result | null>  {
  const bibResult = await client.send(
    new GetCommand({
      TableName: RESULTS_TABLE,
      Key: {
        bib: bib,
      },
    })
  );

  return (bibResult.Item as Result) ?? null;
}

async function getEventStats(eventId: string) : Promise<Stats>  {
  const stat = await client.send(
    new GetCommand({
      TableName: EVENTS_TABLE,
      Key: {
        eventId: eventId,
      },
    })
  );

  const eventStat = stat.Item as Stats

  if(!eventStat){
    const newbornStat = {
      eventId: eventId,
      athletesTracked: 0,
      updatesAccepted: 0,
      updatesIgnored: 0
    }
    
    await client.send(
      new PutCommand({
        TableName: EVENTS_TABLE,
        Item: newbornStat
      })
    );

    return newbornStat
  }

  return eventStat;
}


enum Actions {
  ignored = "RECORD IGNORED",
  processed = "RECORD PROCESSED",
  received = "RECORD RECEIVED"
}

const validateMessage = (msg: Message) => {
  const validStatus = ["PROVISIONAL", "CONFIRMED", "OFFICIAL"]
  if(Object.values(msg).some(value => value == null)){
    return false
  }
  if(!validStatus.includes(msg.status!)){
    return false
  }
  return true

}
const metrics = new Metrics({ namespace: process.env.REJECTION_METRIC_NAMESPACE!, serviceName: 'LambdaAPI' });


exports.handler = async (event: any) => {

    const ingest: Message = JSON.parse(event.body);
    console.log(ingest)

    
    const newRecord = {
      eventId: ingest.eventId!,
      bib: ingest.bib!,
      lane: ingest.lane!,
      revision: ingest.revision!,
      status: ingest.status!,
      timeMs: ingest.timeMs!
    }

    const logger = {
      ...newRecord,
      action: Actions.received
    }

    if(!validateMessage(ingest)){
      // Here comes another doubt, in here the msg can have the eventId null, so how will the updatesIgnored be updated
      console.log("Record corrupt")
      logger.action = Actions.ignored
        metrics.clearMetrics();
        metrics.addMetric(process.env.REJECTION_METRIC_NAME!, MetricUnit.Count, 1);
        metrics.publishStoredMetrics();

      return {
        statusCode: 422,
        body: JSON.stringify({ message: "Record Invalid" }),
      };
    }

    const lastestRevision = await getLastestRevision(ingest.bib!);
    const eventStats = await getEventStats(ingest.eventId!)
    
    if(!lastestRevision){
      console.log("New record")
      //If has no lastest revision, it is a new bib
      eventStats.athletesTracked =  eventStats.athletesTracked + 1
      eventStats.updatesAccepted = eventStats.updatesAccepted + 1
      await client.send(
        new PutCommand({
          TableName: RESULTS_TABLE,
          Item: newRecord,
        })
      );
      logger.action = Actions.processed
    } else {
      if(lastestRevision!.revision >= ingest.revision!){
        eventStats.updatesIgnored = eventStats.updatesIgnored + 1
        console.log("Record ignored")
        logger.action = Actions.ignored
      }
      else {
        await client.send(
          new PutCommand({
            TableName: RESULTS_TABLE,
            Item: newRecord,
          })
        )
        logger.action = Actions.processed
        eventStats.updatesAccepted = eventStats.updatesAccepted + 1
      }
      
      
    }
    await client.send(
      new PutCommand({
        TableName: EVENTS_TABLE,
        Item: eventStats,
      })
    )

    console.log(logger)

    

    return {
        statusCode: 201,
        body: JSON.stringify({ message: "Record Received" }),
    };
};