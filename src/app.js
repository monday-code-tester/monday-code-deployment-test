const express = require('express');


const app = express();
const port = 8080;

app.get('/health', (req, res) => {
    res.status(200).send({"status": "OK"})
})


app.listen(port, () => console.log(`monday code tester app listening at http://localhost:${port}`));

module.exports = { app };
