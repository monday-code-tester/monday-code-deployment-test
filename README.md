# monday-code-deployment-test
This repository is intended for synthetic testing monday code

## Test #1 - DEPLOYMENT
https://app.datadoghq.eu/synthetics/details/ubm-tk8-fte

This test uses our monday.com test account, creates a **new app**, and deploys monday code to it.
1. log in to the account
2. go to dev center, copy dev token
3. create a new app and give it a unique name, copy the app id
4. deploy monday code using a github action, using the token and app id
5. wait X minuets for the deployment to complete (not actually getting any indication of completion)
6. check the app in the dev center to see if the code was deployed and monday code sections are active
7. invoke the deployment url */health*, expect 200


## Test #2 - USABILITY
https://app.datadoghq.eu/synthetics/details/4v8-zi9-tz6

This test uses our monday.com test account, with a **constant existing app on each test**
1. log in to the account
2. go to dev center, copy dev token
3. create a new draft version for the app
4. deploy monday code using a github action, using the token and app id (automatically deploys to the latest draft version)
5. wait X minuets for the deployment to complete (not actually getting any indication of completion)
6. check the new version does not have a "Live Url"
7. promote the new version to live
8. check that the version now also has a live url
9. create a random value for a constant env-var and set it
10. invoke */health* and expect 200
11. invoke */deep-health* and expect 200 - this endpoint uses the SDK secure storage set/get/delete, and also accepts a random work from the test, which is being returned in the 200 response body
12. invoke */topic-name* and expect 200 - this endpoint uses the env-var of the deployment which exposes the deployment tag. this is then used to assert it is equal to the latest version tag shown in the dev center- so we now the live url directs us to the latest version
13. invoke */e v-var* and expect 200 - this returns the random env-var set in a previous step, and asserts equality
14. go to the monitoring section and assert the request count in the last X minutes is not 0
15. go to the logs section and assert the logs are not empty. and contain expected text (including the random word created for the test)
16. create a new env-var, assert it was added, and then delete it

