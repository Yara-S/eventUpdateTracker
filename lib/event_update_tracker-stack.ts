import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import path = require("path");

export class EventUpdateTrackerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const resultsTable = new dynamodb.Table(this, "ResultsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "bib",
        type: dynamodb.AttributeType.STRING,
      },
      // This was when I understood all revisions should be kept in the Results table
      //sortKey: {
      //  name: "revision",
      //  type: dynamodb.AttributeType.NUMBER,
      //}
    });

    resultsTable.addGlobalSecondaryIndex({
      indexName: "EventIdIndex",

      partitionKey: {
        name: "eventId",
        type: dynamodb.AttributeType.STRING,
      },

      sortKey: {
        name: "bib",
        type: dynamodb.AttributeType.STRING,
      },
    });

    const eventsTable = new dynamodb.Table(this, "EventsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "eventId",
        type: dynamodb.AttributeType.STRING,
      },
    });

    const allRejectionsMetric = new cloudwatch.Metric({
      namespace: "TimingTracking",
      metricName: "updatesRejection",
      dimensionsMap: {
        Environment: "Production",
        Region: this.region,
      },
      period: cdk.Duration.minutes(5),
      statistic: "Sum",
    });

    const apiLambda = new lambda.Function(this, "API-Lambda", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("app/lambda"),
      handler: "index.handler",
      environment: {
        RESULTS_TABLE_NAME: resultsTable.tableName,
        EVENTS_TABLE_NAME: eventsTable.tableName,
        REJECTION_METRIC_NAMESPACE: allRejectionsMetric.namespace,
        REJECTION_METRIC_NAME: allRejectionsMetric.metricName,
      },
    });

    const rejectionResolverLambda = new lambda.Function(
      this,
      "Rejection-Lambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset("app/rejectedLambda"),
        handler: "index.handler",
        environment: {
          REJECTION_METRIC_NAMESPACE: allRejectionsMetric.namespace,
          REJECTION_METRIC_NAME: allRejectionsMetric.metricName,
        },
      }
    );

    rejectionResolverLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["cloudwatch:GetMetricStatistics", "cloudwatch:GetMetricData"],
        resources: ["*"],
      })
    );

    resultsTable.grantReadWriteData(apiLambda);
    eventsTable.grantReadWriteData(apiLambda);

    const api = new apigateway.LambdaRestApi(this, "API-Gateway", {
      handler: apiLambda,
      proxy: false,
    });

    // TO DO: Change to requirements
    const singleResource = api.root.addResource("timing");
    singleResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(apiLambda)
    );

    const graphApi = new appsync.GraphqlApi(this, "GraphApi", {
      name: "GraphAPI",
      schema: appsync.SchemaFile.fromAsset("app/graph/schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
        },
      },
      xrayEnabled: true,
    });

    const resultsDataSource = graphApi.addDynamoDbDataSource(
      "ResultsDataSource",
      resultsTable
    );
    const eventsDataSource = graphApi.addDynamoDbDataSource(
      "EventsDataSource",
      eventsTable
    );

    const metricsDataSource = graphApi.addLambdaDataSource(
      "MetricsDataSource",
      rejectionResolverLambda
    );

    resultsDataSource.createResolver("ResultsResolver", {
      typeName: "Query",
      fieldName: "results",
      code: appsync.Code.fromAsset("app/graph/resolvers/results.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    eventsDataSource.createResolver("EventStatsResolver", {
      typeName: "Query",
      fieldName: "eventStats",
      code: appsync.Code.fromAsset("app/graph/resolvers/eventStats.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    resultsDataSource.createResolver("EventsResolver", {
      typeName: "Query",
      fieldName: "events",
      code: appsync.Code.fromAsset("app/graph/resolvers/events.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    eventsDataSource.createResolver("UpdatesIgnoredTotalResolver", {
      typeName: "Query",
      fieldName: "updatesIgnoredTotal",
      code: appsync.Code.fromAsset(
        "app/graph/resolvers/updatesIgnoredTotal.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    metricsDataSource.createResolver("UpdatesRejectedResolver", {
      typeName: "Query",
      fieldName: "updatesRejected",
      code: appsync.Code.fromInline(`
        export function request(ctx) {
          return {
            operation: "Invoke",
            payload: {}
          };
        }
        export function response(ctx) {
          return ctx.result;
        }
      `),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    const s3Bucket = new s3.Bucket(this, "CloudFront-Bucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, "CFDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(s3Bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
    });

    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [s3deploy.Source.asset(path.join(__dirname, "../assets/s3"))],
      destinationBucket: s3Bucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: `https://${distribution.distributionDomainName}`,
  });
  }
}
