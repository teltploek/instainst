var request = require('request');
var cheerio = require('cheerio');
var _ = require('lodash');

var jar = request.jar();

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

var getListPage = function (callback) {
    request({
        url : 'https://rk.inst.dk/Document/CustomList.aspx?Location=FI.B&container=21597&s=Title&af=0&archF=0&pg=1&pgSize=15&ctx=p',
        jar: jar
    }, callback);
}

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
        
    	if(err) {
    		callback.call(null, new Error('Login failed'));
    		return;
    	}
    
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
    
            getListPage(function(err, res, body) {
                var $ = cheerio.load(body);
                var text = $('title').text();
        		
        		console.log(text);
        		console.log('----------------');
                var tbl = $('.grid_view');
         		var rows = $('.grid_view tr:not(.pager,.thead)');
         		
         		_.forEach(rows, function(row) {
         		    var $ = cheerio.load(row);
         		    console.log($('.modified').text());
         		});
            });
    		
    		
    	});
    });
});