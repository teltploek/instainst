var fs = require('fs');
var path = require('path');
var http = require('http');
var u = require('url');
var request = require('request');
var sync_request = require('sync-request');
var cheerio = require('cheerio');
var _ = require('lodash');
var nodemailer = require('nodemailer');
var mkdirp = require('mkdirp');
var jade = require('jade');
var Q = require('q');

// init cookie jar so we store cookies to be able to login
var jar = request.jar();

// hardcoded categories that I'm interested in
var categories = {
    'uglerne'       : 21597,
    'humlebierne'   : 4740,
    'laerkerne'      : 1613
};

var credentials = {
	username: process.env.username,
	password: process.env.password
};

var url = 'https://rk.inst.dk/Login.aspx?ReturnUrl=%2fUser%2fEntryPoint.aspx';

// we need to make a initial request to the login page to
// be able to retrieve the viewstate, viewstategenerator and eventvalidation values
// making it possible to submit the form and get a user session in return
var collectFormAttributes = function (callback) {
    request({ url: url }, callback);
};

// do the actual login post
var login = function (formAttributes, callback) {
    request.post({
        url : url,
        jar: jar,
      	form : {
      	  '__VIEWSTATE'                                     :   formAttributes.viewstate,
      	  '__VIEWSTATEGENERATOR'                            :   formAttributes.viewstategenerator,
      	  '__EVENTVALIDATION'                               :   formAttributes.eventvalidation,
      	  'ctl00$ctl00$Content$Content$_Login$UserName'     :   credentials.username,
          'ctl00$ctl00$Content$Content$_Login$Password'     :   credentials.password,
          'ctl00$ctl00$Content$Content$_Login$LoginButton'  :   'Log ind'
      	}
    }, 
    
    callback);
};

// do required intermediate redirection
var redirect = function (callback) {
    request({
        url : 'https://rk.inst.dk/User/EntryPoint.aspx?Location=IP.B', 
        jar: jar
    }, callback);
};

// show front page
var getFrontPage = function (callback) {
    request({
	    url : 'https://rk.inst.dk/Foresides/IntraForeside.aspx?Location=FI.B&t=person', 
	    jar: jar
	}, callback);
};

var getListPages = function (callback) {
   _.forEach(categories, function(category, label) {
       getListPage(category, label, callback);
   });
};

var getListPage = function (category, label, callback) {
    request({
        url : 'https://rk.inst.dk/Document/CustomList.aspx?Location=FI.B&container='+category+'&s=Title&af=0&archF=0&pg=1&pgSize=1000&ctx=p',
        jar: jar
    }, function(err, res, body) {
        callback(category, label, err, res, body);
    });
};

var processEntry = function(category, label, row) {
    var $ = cheerio.load(row);
    
    var date = $('.modified').text();
    
    var url = u.resolve('https://rk.inst.dk', $('a').attr('href'));

    var dest = path.join('./entries', label, date);
    var filename = path.join(dest, $('a').attr('title'));
    
    if (!fs.existsSync(dest)) {
        mkdirp.sync(dest);
    }
    
    if (!fs.existsSync(filename)) {
        request({
            url : url,
            jar : jar
        }, function (err, res, body) {
            var $ = cheerio.load(body);
            var paragraphs = $('p');
            
            var txt = '';
            var textblocks = [];
            var convertedImages = [];
            var imageUrls = [];
            
            function retrieveContent() {
                var deferreds = [];
                
                _.forEach(paragraphs, function(paragraph) {
                    var $ = cheerio.load(paragraph);
                    var imgs = $('img');
                   
                    if (imgs.length) {
                        _.forEach(imgs, function (img) {
                            var deferred = Q.defer();
                            var $ = cheerio.load(img);
                            var imageUrl = $('img').attr('src').replace('https:', 'http:');
                            
                            imageUrls.push(imageUrl);
                            
                            //     request({
                            // 	    url : imageUrl,
                            // 	    encoding: null
                            // 	}, function (err, res, body) {
                            // 	   var data = 'data:' + res.headers['content-type'] + ';base64,' + new Buffer(body).toString('base64');
                                
                            // 	   convertedImages.push(data);
                            	   
                            // 	   deferred.resolve(data);
                            // 	});
                            
                            // Until we figure out how to fetch the images, we will just resolve promises immediately
                            deferred.resolve();
                        	
                        	deferreds.push(deferred.promise);
                        });
                    }else{
                        txt = $('p').text().replace(/ /gm,'');
                        txt = txt.replace(/(\r\n|\n|\r)/gm,'');
                        
                        if (txt !== '') {
                            textblocks.push(txt);
                        }
                    }
                });
                
                return Q.all(deferreds);
            }
            
            retrieveContent().then(function(){
                // Compile a function
                var fn = jade.compileFile('./mail-tpl.jade', { pretty : true });
    
                // Render the function
                var html = fn({
                    textblocks  : textblocks,
                    images      : convertedImages,
                    imageUrls   : imageUrls
                });
               
                fs.writeFile(filename, html, function(err) {
                    if(err) {
                        console.log(err);
                    } else {
                        console.log(filename, 'was saved!');
                    }
                });
            });
        });
    }
};


// step 1 - retrieving form info
collectFormAttributes(function(err,res,body){
    var $ = cheerio.load(body);
    
    var formAttributes = {
        viewstate               : $('input[name="__VIEWSTATE"]').val(),
        viewstategenerator      : $('input[name="__VIEWSTATEGENERATOR"]').val(),
        eventvalidation         : $('input[name="__EVENTVALIDATION"]').val()
    };

    // step 2 - posting login information
    login(formAttributes, function(err, res, body){
        // debug : console.log(jar.getCookieString('https://rk.inst.dk'));
    
        // step 3 - redirect to intermediate step
    	redirect(function(err, res, body) {
    		// debug : console.log(jar.getCookieString('https://rk.inst.dk'));
    		
    		// step 4 - get some data to work on
    
            getListPages(function(category, label, err, res, body) {
                var $ = cheerio.load(body);
                
         		var rows = $('.grid_view tr:not(.pager,.thead)');
         		_.forEach(rows, function(row) {
         		    processEntry(category, label, row);
         		});
            });
    		
    		
    	});
    });
});

// var smtpTransport = nodemailer.createTransport("SMTP",{
//   service: "Gmail",
//   auth: {
//       user: "boerneintra@gmail.com",
//       pass: ""
//   }
// });

// smtpTransport.sendMail({
//   from: "Børneintra <boerneintra@gmail.com>", // sender address
//   to: "Brian Frisch <brian.frisch@gmail.com>", // comma separated list of receivers
//   subject: "Huh? ✔", // Subject line
//   text: "Hello world ✔" // plaintext body
// }, function(error, response){
//   if(error){
//       console.log(error);
//   }else{
//       console.log("Message sent: " + response.message);
//   }
// });