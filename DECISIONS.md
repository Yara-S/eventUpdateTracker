## Known concessions

Points of doubt around the challenge:
1. Is it possible to receive a repeated record (same bib) with a different lane? For the sake of the exercise I did not include or check this scenario
2. At first, my line of thought was that every revision update (if not ignored) was being recorded in the system. But after a while working in the solution I started to wonder if the correct approach is just to store the last revision (this means updating the whole record instead of creating a new one with a bigger revision). I couldn't be sure if the Results table should store ALL the received (valid) revisions or only the latest one. This is important because it changes how I implement my dynamo table and the GraphQL queries.
3. 