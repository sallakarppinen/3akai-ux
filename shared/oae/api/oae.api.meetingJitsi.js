define(['exports', 'jquery'], function(exports, $) {

    var createMeeting = exports.createMeeting = function (displayName, description, chat, contactList, visibility, managers, members, callback) {

        if (!displayName) {
            throw new Error('A valid document name should be provided');
        }

        // Set a default callback function in case no callback function has been provided
        callback = callback || function() {};

        var data = {
            'displayName': displayName,
            'description': description,
            'chat': chat,
            'contactList': contactList,
            'visibility': visibility,
            'managers': managers,
            'members': members
        };

        $.ajax({
            'url': '/api/meetingJitsi/create',
            'type': 'POST',
            'data': data,
            'success': function (data) {
                return callback(null, data);
            },
            'error': function (jqXHR, textStatus) {
                return callback({'code': jqXHR.status, 'msg': jqXHR.responseText});
            }
        });

    };

});