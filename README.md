# Instainst

I often forget to read up on the daily updates from my kids institution.

Probably because the login procedure is tedious and the UI incredible boring.

This system will crawl and retrieve the entries from the categories I'm interested in, and make them available to me automatically on a daily basis.

So it's a 100% personal project, and right now a hardcoded can of worms, but feel free to grab anything that would be of any use to you.

## Usage (mostly a note to self thing at this point)

To be able to login you'll need to pass in a username and a password in the ENV variables

* `process.env.username` - username for the login screen
* `process.env.password` - password for the login screen
* `process.env.mailerEmail` - e-mail address to send from (must be a gmail address)
* `process.env.mailerPassword` - password for the mailer e-mail address

## TODO

Write docs for the options needed for the instainst module constructor.