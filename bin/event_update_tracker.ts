#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EventUpdateTrackerStack } from '../lib/event_update_tracker-stack';

const app = new cdk.App();
new EventUpdateTrackerStack(app, 'EventUpdateTrackerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
    region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION,
  },
});