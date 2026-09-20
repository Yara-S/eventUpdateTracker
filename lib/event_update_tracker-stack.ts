import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class EventUpdateTrackerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const resultsTable = new dynamodb.Table(this, "ResultsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "bib",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "revision",
        type: dynamodb.AttributeType.NUMBER,
      }
    });

    const apiLambda = new lambda.Function(this, 'API-Lambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('app/lambda'), 
      handler: 'index.handler', 
      environment: {
        RESULTS_TABLE_NAME: resultsTable.tableName,
        EVENTS_TABLE_NAME: ""
      }
    });

    resultsTable.grantReadWriteData(apiLambda)

    const api = new apigateway.LambdaRestApi(this, 'API-Gateway', {
      handler: apiLambda,
      proxy: false,
    });

    // TO DO: Change to requirements
    const singleResource = api.root.addResource('track');
    singleResource.addMethod('GET');


    
  }
}
