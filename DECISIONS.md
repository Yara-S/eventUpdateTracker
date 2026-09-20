## Known concessions

Points of doubt around the challenge:
1. Is it possible to receive a repeated record (same bib) with a different lane? For the sake of the exercise I did not include or check this scenario
2. At first, my line of thought was that every revision update (if not ignored) was being recorded in the system. But after a while working in the solution I started to wonder if the correct approach is just to store the last revision (this means updating the whole record instead of creating a new one with a bigger revision). I couldn't be sure if the Results table should store ALL the received (valid) revisions or only the latest one. This is important because it changes how I implement my dynamo table and the GraphQL queries.
3. It was not possible to put the html file under a CloudFront distribution because when I tried to do so I received a warning from AWS my account had been limited and that I needed to access support (Decided to skip it for the sake of this challenge)

Implementations I would do/complete if could dedicate more time:
- Implement proper try/error in the lambda code and enhance how the updateRejected are being populated
- Include a decent type and value validation for the incoming message format
- Spending more time enhancing the GraphQL and the static file
- Including a way of also increasing the rejection metric under the API Gateway so all the failed calls can be registered
- Enhance the log in the lambda code
- I could not include the CloudWatch alarm mentioned in the requirements. To be honest I could not understand how would it be used for.

## How it works, and why

1. The endpoint receives a request with the required format. The system has two created dynamodb tables (Results and EventStats). Upon receiving the request, the lambda checks for the BIB attribute and checks if there is already a record with this bib in the Results table. If no record is found, this incoming request is accepted and the first record for revision for that bib is created in the system. Upon every request the EVENTID attribute is used to also check the EventStats table and proceed with the same proccess. 

2. If there is already a record with that BIB in the system the code checks the revision number. If all requirements are satisfied the record is updated (this means the same record continues but only the Status, Revision and TimeMs attribute are updated). If the requirements are not met then the record is rejected. Following the same proccess the EventStats is updated using the EventId

3. The GraphQL API uses the dynamo db tables as data sources, as well as the metric created to control de updateRejected numbers. This API is then accessible using a static html file hosted on s3 that will call up directly the API and serve the results

### AI assistance

1. As I did not had idea how to setup a graphQL API using CDK I used AI to help me during this part and generate the schema, the resolvers and also the s3 html static file. As I was running out of time I rely on AI to help me accelerate this last stage.

