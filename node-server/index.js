const axios = require('axios')
const express = require('express')
const bodyParser = require('body-parser')
const AWSXRay = require('aws-xray-sdk')
const port = process.env.PORT || 3000
const app = express()

const apiPort = process.env.API_PORT || "8501"
const apiURL = process.env.API_URL || "3.216.123.214"
const apiEndpoint = `http://${apiURL}:${apiPort}/v1/models/inception/versions/1:predict`
let timeout = 5000

if (process.env.XRAY_ENABLED == "true") {
    AWSXRay.captureHTTPsGlobal(require('http'));
    AWSXRay.captureHTTPsGlobal(require('https'));
    AWSXRay.capturePromise();
    app.use(AWSXRay.express.openSegment('tf-client'));
}

if (process.env.TIMEOUT) {
    timeout = parseInt(process.env.TIMEOUT)
}

app.use(bodyParser.json())

const getBase64 = async (url) => {
    try {
        response = await axios.get(url, { responseType: 'arraybuffer', timeout: timeout })
        return response.data.toString('base64')
    } catch (error) {
        throw (Error(`Failed in downloading ${url}, error message: ${error.message}`))
    }
}

const predict = async (url) => {
    try {
        image = await getBase64(url)
        payload = {
            signature_name: 'predict_images',
            instances: [{ b64: image }]
        }
        result = await axios.post(apiEndpoint, payload, { timeout })
        return {
            url: url,
            status: 'success',
            predictions: result.data.predictions
        }
    } catch (error) {
        return {
            url: url,
            status: 'error',
            message: `Error in getting result from TensorFlow, error message: ${error.message}`
        }
    }
}

// predict(externalUrl)
//     .then(data => console.log(JSON.stringify(data, null, 2)))

app.post("/predict", async (request, response) => {
    try {
        if (request.body.images == null) {
            throw (Error("couldn't find \"image\" key in payload's body"))
        }
        const works = []
        request.body.images.forEach((image) => {
            works.push(predict(image))
        })
        result = await Promise.all(works)
        response.json(result)
    } catch (error) {
        response.json({ message: error.message })
    }
})

app.get("/", (request, response) => {
    response.json({ status: "ok" })
})

if (process.env.XRAY_ENABLED == "true") {
    app.use(AWSXRay.express.closeSegment());
}

app.listen(port, () => {
    console.log(`App started and serving on port ${port}`)
})