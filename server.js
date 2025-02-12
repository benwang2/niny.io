// this should be your domain name
let hostname = process.env.HOSTNAME || "https://niny.io";
//==============================================
// standard express server
const express = require("express");
const app = express();
// fix the issue that ratelimited everyone if there was one bad actor spamming
// the website (bc it's hosted on glitch with a reverse proxy, you can comment
// this out if you're not hosting on glitch)
app.enable("trust proxy");
// prevent abuse
const rateLimit = require("express-rate-limit");
app.all("*", checkHttps);
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // You can make max 60 links per min (pretty generous tbh)
});
app.use(limiter);
// add handlebars for templating
const exphbs = require("express-handlebars");
app.engine("handlebars", exphbs());
app.set("view engine", "handlebars");

// using keyV bc it's all we really need for a simple app like this
const Keyv = require("keyv");
const links = new Keyv("sqlite://database.sqlite");
// regex used to validate links
// regex-weburl.js by Diego Perini0;
var urlregex = new RegExp(/^(?:(?:(?:https?|ftp?|http):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?$/i);

// generate random links if no vanity url is provided
const words = require("friendly-words");

// parse incoming json files
app.use(express.json());

// serve static files in public directory
app.use(express.static("public"));
// https redirect

// listen on port 3000
app.listen(3000, () => {
  console.log(`psty app listening at 3000`);
});

// serve webpage
app.get("/", (request, response) => {
  response.render("index", {
    hostname: hostname.split("://")[1],
    layout: false,
  });
});

// validate that webpage is being served at url
// uses axios and RegExp
async function getValidUrl(url){
  if (url.trim()=="") return false;
  if (!url.match(urlRegEx)) return false;
  try {
      if (url.substring(0,6)!="https:" && url.substring(0,5)!="http:") {
          let [test1, test2, validUrl] = ["https://" + url, "http://" + url, false];
          let [res1, res2]  = [await axios.get(test1), await axios.get(test2)]
          validUrl = (res1 != null ? test1 : (res2 != null ? test2 : false));
      } else {
          let res1 = await axios.get(url)
          validUrl = (res1 != null ? url : false)
      }
  } catch (e) {
    // some webpages terminate fetch requests early
    validUrl = e.request.finished ? e.request._redirectable._currentUrl : false
  }
  return validUrl
}

// literally this simple, we check if vanity is taken. if not, we create a new
// entry in db
app.post("/shortenlink", async (request, response) => {
  try {
    let json = request.body;
    if (json.vanity.trim() == "") {
      json.vanity = await generateuuid();
    }
    // if the vanity is not taken
    if (!(await links.get(json.vanity))) {
      // if the link is valid
      let url = getValidUrl(json.newLink);
      if (url != null && url != false) {
        links.set(json.vanity, url);
        response.json({
          status:
            "Success! You can view your link at " +
            hostname +
            "/" +
            json.vanity,
          vanity: json.vanity,
          url: hostname + "/" + json.vanity,
        });
      } else {
        response.status(400).send("URL invalid");
      }
    } else {
      console.log(json.vanity.trim());
      response.status(409).send("Vanity already taken :(");
    }
  } catch (e) {
    response.status(400).send("Bad Request");
    console.log(e);
  }
});

// direct link to vanity using /vanity instead of using query params for shorter
// links :D
app.get("/:vanity", async (request, response) => {
  try {
    let vanityurl = request.params.vanity;
    let finalurl = await links.get(vanityurl);
    if (finalurl) {
      if (!/^https?:\/\//i.test(finalurl)) {
        finalurl = "https://" + finalurl;
      }
      response.redirect(finalurl);
    } else {
      response.status(404).send("Vanity does not exist");
    }
  } catch (e) {
    response.status(400).send("Bad Request");
    console.log(e);
  }
});
// integration with discord.bio :)
app.get("/p/:vanity", async (request, response) => {
  try {
    let vanityurl = request.params.vanity;
    response.redirect("https://discord.bio/p/" + vanityurl);
  } catch (e) {
    response.status(404).send("Vanity does not exist");
  }
});
async function generateuuid() {
  // no vanity provided, generate one :D
  let founduniqueidentifier = false;
  // loop until we find a unique link that we can use to generate a shortened
  // link
  while (!founduniqueidentifier) {
    let unique = await getwords(1, "-");
    console.log(unique);
    if (!(await links.get(unique))) {
      founduniqueidentifier = true;
      return unique;
    }
  }
}
async function getwords(count, seperator) {
  const { predicates, objects } = words;
  const pCount = predicates.length;
  const oCount = objects.length;
  const output = [];

  for (let i = 0; i < count; i++) {
    const pair = [
      predicates[Math.floor(Math.random() * pCount)],
      objects[Math.floor(Math.random() * oCount)],
    ];
    output.push(pair.join(seperator));
  }

  return output;
}
// only works on glitch.me domain for now
function checkHttps(req, res, next) {
  // protocol check, if http, redirect to https
  console.log(req.get("X-Forwarded-Proto"));
  if (req.get("X-Forwarded-Proto").indexOf("https") != -1) {
    return next();
  } else {
    res.redirect("https://" + req.hostname + req.url);
  }
}
