/**
 * Slack plugin
 *
 * Notifies all events (up, down, paused, restarted) by slack webhook
 *
 * Installation
 * ------------
 * This plugin is disabled by default. To enable it, add its entry
 * to the `plugins` key of the configuration:
 *
 *   // in config/production.yaml
 *   plugins:
 *     - ./plugins/slack
 *
 * Usage
 * -----
 * This plugin sends an slack message to a specific channel each time a check is started, goes down, or goes back up.
 * When the check goes down, the slack contains the error details:
 *
 *   Object: [Down] Check "FooBar" just went down
 *   On Thursday, September 4th 1986 8:30 PM,
 *   a test on URL "http://foobar.com" failed with the following error:
 *
 *     Error 500
 *
 *   Uptime won't send anymore messages about this check until it goes back up.
 *   ---------------------------------------------------------------------
 *   This is an automated slack message sent from Uptime. Please don't reply to it.
 *
 * Configuration
 * -------------
 * Here is an example configuration:
 *
 *   // in config/production.yaml
 *   slack:
 *     default_webhook:      SMTP  # possible methods are SMTP, SES, or Sendmail
 *
 */
var fs = require('fs');
var request = require('request');
var moment = require('moment');
var CheckEvent = require('../../models/checkEvent');
var ejs = require('ejs');
var template = fs.readFileSync(__dirname + '/views/_detailsEdit.ejs', 'utf8');


exports.initWebApp = function (options) {
    var slackConfig = options.config.slack;

    var templateDir = __dirname + '/views/';
    var dashboard = options.dashboard;
    CheckEvent.on('afterInsert', function (checkEvent) {
        if (!slackConfig.event[checkEvent.message]) return;



        checkEvent.findCheck(function (err, check) {
            if (err) {
                return console.error(err);
            }

            if (!check.pollerParams){
                console.error('Missing pollerParams for check %s', check);
                check.pollerParams = {}
            }

            if (check.pollerParams.disable_slack) {
                return
            }

            var slackChannel = check.pollerParams.slack_channel || slackConfig && slackConfig.slack_channel;
            if (!slackChannel){
                return console.error('No slack channel in either project or configuration yml')
            }

            var filename = templateDir + checkEvent.message + '.ejs';
            var renderOptions = {
                check: check,
                checkEvent: checkEvent,
                url: options.config.url,
                moment: moment,
                filename: filename
            };
            var lines = ejs.render(fs.readFileSync(filename, 'utf8'), renderOptions).split('\n');

            var slackOptions = {
                url: slackChannel,
                body: JSON.stringify({text: lines.join('\n')}),
                // json: true,
                timeout: 2000
            };
            request.post(slackOptions, function (err, response) {
                if (err || response && response.statusCode == 500) {
                    return console.error('Slack plugin error: %s', err);
                }
                console.log('Notified event by slack: Check ' + check.name + ' ' + checkEvent.message);
            });
        });
    });

    dashboard.on('populateFromDirtyCheck', function (checkDocument, dirtyCheck, type) {
        if (type !== 'http' && type !== 'https') return;
        var slack_channel = dirtyCheck.slack_channel;
        var disable_slack = !!dirtyCheck.disable_slack;

        checkDocument.setPollerParam('slack_channel', slack_channel);
        checkDocument.setPollerParam('disable_slack', disable_slack);

    });

    dashboard.on('checkEdit', function (type, check, partial) {
        if (type !== 'http' && type !== 'https') return;
        partial.push(ejs.render(template, {locals: {check: check}}));
    });


    console.log('Enabled Slack notifications');
};
