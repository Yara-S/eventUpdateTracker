import {
    CloudWatchClient,
    GetMetricStatisticsCommand,
  } from '@aws-sdk/client-cloudwatch';
  
  const cloudWatch = new CloudWatchClient({});
  
  export const handler = async () => {
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000);
  
    const response = await cloudWatch.send(
      new GetMetricStatisticsCommand({
        Namespace: process.env.REJECTION_METRIC_NAMESPACE!,
        MetricName: process.env.REJECTION_METRIC_NAME!,
  
        Dimensions: [
          {
            Name: 'Environment',
            Value: 'dev',
          },
        ],
  
        StartTime: start,
        EndTime: now,
  
        Period: 3600,
  
        Statistics: ['Sum'],
      })
    );
  
    const datapoints = response.Datapoints ?? [];
  
    return datapoints.reduce(
      (sum, point) => sum + (point.Sum ?? 0),
      0
    );
  };