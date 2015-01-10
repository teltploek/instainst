var fs = require('fs');
var path = require('path');
var request = require('request');
var cheerio = require('cheerio');
var _ = require('lodash');

// init cookie jar so we store cookies to be able to login
var jar = request.jar();

// hardcoded categories that I'm interested in
var categories = {
    'uglerne'       : 21597,
    'humlebierne'   : 4740,
    'lærkerne'      : 1613
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
    
    callback)
};

// do required intermediate redirection
var redirect = function (callback) {
    request({
        url : 'https://rk.inst.dk/User/EntryPoint.aspx?Location=IP.B', 
        jar: jar
    }, callback);
}

// show front page
var getFrontPage = function (callback) {
    request({
	    url : 'https://rk.inst.dk/Foresides/IntraForeside.aspx?Location=FI.B&t=person', 
	    jar: jar
	}, callback);
}

var getListPages = function (callback) {
   _.forEach(categories, function(key, val) {
       console.log(key, val)
       getListPage(key, val, callback);
   });
};

var getListPage = function (label, category, callback) {
    request({
        url : 'https://rk.inst.dk/Document/CustomList.aspx?Location=FI.B&container='+category+'&s=Title&af=0&archF=0&pg=1&pgSize=1000&ctx=p',
        jar: jar
    }, callback);
};

var processEntry = function(row) {
    //console.log(category);
    
    var $ = cheerio.load(row);
    console.log($('.modified').text());
    
    if (!fs.existsSync('./entries')) {
        fs.mkdir('./entries')
    };
};


// step 1 - retrieving form info
collectFormAttributes(function(err,res,body){
    var $ = cheerio.load(body);
    
    formAttributes = {
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
            // 		getFrontPage(function(err, res, body) {
            //     		if(err) {
            //     			callback.call(null, new Error('Request failed'));
            //     			return;
            //     		}
                
            //     		var $ = cheerio.load(body);
            //     		var text = $('title').text();
                		
            //     		console.log(text);
            //     	});
    
            getListPages(function(err, res, body) {
                var $ = cheerio.load(body);
                var text = $('title').text();
        		
        		console.log(text);
        		console.log('----------------');
                var tbl = $('.grid_view');
         		var rows = $('.grid_view tr:not(.pager,.thead)');
         		
         		_.forEach(rows, processEntry);
            });
    		
    		
    	});
    });
});