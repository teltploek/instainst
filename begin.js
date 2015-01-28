var fs = require('fs');
var path = require('path');
var http = require('http');
var url_module = require('url');
var request = require('request');
var sync_request = require('sync-request');
var cheerio = require('cheerio');
var _ = require('lodash');
var nodemailer = require('nodemailer');
var mkdirp = require('mkdirp');
var jade = require('jade');
var Q = require('q');

var credentials = {
	username: process.env.username,
	password: process.env.password
};

function Inst (options) {
    // init cookie jar so we store cookies to be able to login
    this.jar = request.jar();
    
    this.formAttributes = {};
    
    this.categories = options.categories || {};
};

Inst.prototype.getLoginPage = function () {
    var url = 'https://rk.inst.dk/Login.aspx?ReturnUrl=%2fUser%2fEntryPoint.aspx';
    var deferred = Q.defer();
    
    request({ url: url }, function (err, res, body) {
        deferred.resolve({ res : res, body : body });
    });
    
    return deferred.promise;
};

Inst.prototype.collectFormAttributes = function (promise) {
    var $ = cheerio.load(promise.body);
    
    this.formAttributes = {
        '__VIEWSTATE'           : $('input[name="__VIEWSTATE"]').val(),
        '__VIEWSTATEGENERATOR'  : $('input[name="__VIEWSTATEGENERATOR"]').val(),
        '__EVENTVALIDATION'     : $('input[name="__EVENTVALIDATION"]').val()
    };
};

Inst.prototype.login = function () {
    var url = 'https://rk.inst.dk/Login.aspx?ReturnUrl=%2fUser%2fEntryPoint.aspx';
    var deferred = Q.defer();
    
    request.post({
        url : url,
        jar: this.jar,
      	form : {
      	  '__VIEWSTATE'                                     :   this.formAttributes.__VIEWSTATE,
      	  '__VIEWSTATEGENERATOR'                            :   this.formAttributes.__VIEWSTATEGENERATOR,
      	  '__EVENTVALIDATION'                               :   this.formAttributes.__EVENTVALIDATION,
      	  'ctl00$ctl00$Content$Content$_Login$UserName'     :   credentials.username,
          'ctl00$ctl00$Content$Content$_Login$Password'     :   credentials.password,
          'ctl00$ctl00$Content$Content$_Login$LoginButton'  :   'Log ind'
      	}
    }, function (err, res, body) {
        deferred.resolve({ res : res, body : body });
    });
    
    return deferred.promise;
};

// do required intermediate redirection
Inst.prototype.redirect = function (promise) {
    var deferred = Q.defer();
    
    request({
        url : 'https://rk.inst.dk/User/EntryPoint.aspx?Location=IP.B', 
        jar: this.jar
    }, function (err, res, body) {
        deferred.resolve({ res : res, body : body });
    });
    
    return deferred.promise;
};

Inst.prototype.getCategoryPages = function (promise) {
    var self = this;
    var deferreds = [];

   _.forEach(this.categories, function(category, label) {
       var listPagePromise = self.getCategoryPage(category, label);
       
       deferreds.push(listPagePromise);
   });
   
   return Q.all(deferreds);
};

Inst.prototype.getCategoryPage = function (category, label) {
    var deferred = Q.defer();
    
    request({
        url : 'https://rk.inst.dk/Document/CustomList.aspx?Location=FI.B&container='+category+'&s=Title&af=0&archF=0&pg=1&pgSize=1000&ctx=p',
        jar: this.jar
    }, function(err, res, body) {
        deferred.resolve({ category: category, label: label, res : res, body : body });
    });
    
    return deferred.promise;
};

Inst.prototype.parseCategoryPages = function (promises) {
    var self = this;
    var deferreds = [];
    
    _.forEach(promises, function(promise) {
        var $ = cheerio.load(promise.body);
                    
     	var rows = $('.grid_view tr:not(.pager,.thead)');
     	
     	_.forEach(rows, function(row) {
     	    var parseCategoryPagePromise = self.processEntry(promise.category, promise.label, row);
     	    
     	    if (typeof parseCategoryPagePromise !== 'undefined') {
     	        deferreds.push(parseCategoryPagePromise);
     	    }
     	});
    });
    
    return Q.all(deferreds);
};

Inst.prototype.processEntry = function(category, label, row) {
    var deferred;
    
    var $ = cheerio.load(row);
    
    var date = $('.modified').text();
    
    var url = url_module.resolve('https://rk.inst.dk', $('a').attr('href'));

    var dest = path.join('./entries', label, date);
    var filename = path.join(dest, $('a').attr('title'));
    
    if (!fs.existsSync(dest)) {
        mkdirp.sync(dest);
    }

    if ( !fs.existsSync(filename) ) {
        deferred = Q.defer();
        request({
            url : url,
            jar : this.jar
        }, function (err, res, body) {
            deferred.resolve({ res : res, body : body, filename: filename });
        });
        
        return deferred.promise;
    }
};

Inst.prototype.writeFiles = function (promises) {
    _.forEach(promises, function(promise) {
        var $ = cheerio.load(promise.body);
        var paragraphs = $('p');
                
        var filename = promise.filename;
        var txt = '';
        var textblocks = [];
        var convertedImages = [];
        var imageUrls = [];
            
        _.forEach(paragraphs, function(paragraph) {
            var $ = cheerio.load(paragraph);
            var imgs = $('img');
           
            if (imgs.length) {
                _.forEach(imgs, function (img) {
                    var deferred = Q.defer();
                    var $ = cheerio.load(img);
                    var imageUrl = $('img').attr('src').replace('https:', 'http:');
                    
                    imageUrls.push(imageUrl);
                });
            }else{
                txt = $('p').text().replace(/ /gm,'');
                txt = txt.replace(/(\r\n|\n|\r)/gm,'');
                
                if (txt !== '') {
                    textblocks.push(txt);
                }
            }
        });
        
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
};

Inst.prototype.init = function () {
    Q.fcall( this.getLoginPage.bind(this) )
        .then( this.collectFormAttributes.bind(this) )
        .then( this.login.bind(this) )
        .then( this.redirect.bind(this) )
        .then( this.getCategoryPages.bind(this) )
        .then( this.parseCategoryPages.bind(this) )
        .then( this.writeFiles.bind(this) );
};

var inst = new Inst({ 
    categories : {
        'uglerne'       : 21597,
        'humlebierne'   : 4740,
        'laerkerne'     : 1613
    }
});

inst.init();