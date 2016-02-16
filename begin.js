var Instainst = require('./instainst');

var credentials = {
	username: process.env.username,
	password: process.env.password
};

var inst = new Instainst({
    mailercredentials : {
        email       : process.env.mailerEmail,
        password    : process.env.mailerPassword
    },
    recipients : [
        'brian.frisch@gmail.com'
    ],
    categories : {
        'viberne'     : 1608
    },
    credentials : {
	    username: process.env.username,
	    password: process.env.password
    }
});

inst.run();