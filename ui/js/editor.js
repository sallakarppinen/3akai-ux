/*!
 * Copyright 2014 Apereo Foundation (AF) Licensed under the
 * Educational Community License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may
 * obtain a copy of the License at
 *
 *     http://opensource.org/licenses/ECL-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

require(['jquery', 'underscore', 'oae.core'], function($, _, oae) {

    // Variable used to cache the content's base URL
    var baseUrl = '/';

    // Variable used to cache the requested content profile
    var contentProfile = {
        displayName: 'Test'
    };

    var setUpNavigation = function() {
        var lhNavPages = [{
            'id': 'content',
            'title': contentProfile.displayName,
            'icon': 'fa-comments',
            'closeNav': true,
            'class': 'hide',
            'layout': [
                {
                    'width': 'col-md-12',
                    'widgets': [
                        {
                            'name': 'comments'
                        }
                    ]
                }
            ]
        }];

        $(window).trigger('oae.trigger.lhnavigation', [lhNavPages, [], baseUrl]);
        $(window).on('oae.ready.lhnavigation', function() {
            $(window).trigger('oae.trigger.lhnavigation', [lhNavPages, [], baseUrl]);
        });
    };

    var setUpClip = function() {
        oae.api.util.template().render($('#content-clip-template'), {
            'content': contentProfile,
            'displayOptions': {
                'addLink': false
            }
        }, $('#content-clip-container'));
    };

    setUpClip();
    setUpNavigation();
    // We can now unhide the page
    oae.api.util.showPage();
});
