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

/**
 * This module exposes logic that adapts a set of activities in the activitystrea.ms format
 * into a friendlier view modal that can be used to render activity streams in the UI, emails, etc..
 *
 * We need to mimick AMD's define so we can use this code in both the backend and frontend.
 *
 * @param  {Object}     exports     Properties that are added on this object are exported
 * @param  {Object}     _           The underscorejs utility
 * @api private
 */
var _expose = function(exports, _) {

    /**
     * Adapt a set of activities in activitystrea.ms format to a simpler view model
     *
     * @param  {String}                 context                                 The ID of the user or group that owns this activity stream
     * @param  {User}                   me                                      The currently loggedin user
     * @param  {Activity[]}             activities                              The set of activities to adapt
     * @param  {Object}                 sanitization                            An object that exposes basic HTML encoding functionality
     * @param  {Function}               sanitization.encodeForHTML              Encode a value such that it is safe to be embedded into an HTML tag
     * @param  {Function}               sanitization.encodeForHTMLAttribute     Encode a value such that it is safe to be embedded into an HTML attribute
     * @param  {Function}               sanitization.encodeForURL               Encode a value such that it is safe to be used as a URL fragment
     * @return {ActivityViewModel[]}                                            The adapted activities
     */
    var adapt = exports.adapt = function(context, me, activities, sanitization) {
        return _.map(activities, function(activity) {
            return _adaptActivity(context, me, activity, sanitization);
        });
    };

    /**
     * Adapt a single activity in activitystrea.ms format to a simpler view model
     *
     * @param  {String}                 context                                 The ID of the user or group that owns this activity stream
     * @param  {User}                   me                                      The currently loggedin user
     * @param  {Activity}               activity                                The activity to adapt
     * @param  {Object}                 sanitization                            An object that exposes basic HTML encoding functionality
     * @param  {Function}               sanitization.encodeForHTML              Encode a value such that it is safe to be embedded into an HTML tag
     * @param  {Function}               sanitization.encodeForHTMLAttribute     Encode a value such that it is safe to be embedded into an HTML attribute
     * @param  {Function}               sanitization.encodeForURL               Encode a value such that it is safe to be used as a URL fragment
     * @return {ActivityViewModel}                                              The adapted activity
     * @api private
     */
    var _adaptActivity = function(context, me, activity, sanitization) {
        // Move the relevant items (comments, previews, ..) to the top
        _prepareActivity(activity);

        // Generate an i18nable summary for this activity
        var summary = _generateSummary(me, activity, sanitization);

        // Generate the primary actor view
        var primaryActor = _generatePrimaryActor(activity);

        // Generate the activity preview items
        var activityItems = _generateActivityItems(context, activity);

        // Construct the adapted activity
        return new ActivityViewModel(activity, summary, primaryActor, activityItems);
    };


    ////////////
    // Models //
    ////////////

    /**
     * A model that represents an activitystrea.ms activity into an easily consumable format
     *
     * @param {Activity}                activity        The original activity in activitystrea.ms format
     * @param {ActivityViewSummary}     summary         The summary object for this activity
     * @param {ActivityViewItem}        primaryActor    The object that identifies the primary actor
     * @param {ActivityViewItem[]}      activityItems   The activity view items that are included in this activity
     */
    var ActivityViewModel = function(activity, summary, primaryActor, activityItems) {
        var that = {
            'activity': activity,
            'activityItems': activityItems,
            'id': activity['oae:activityId'],
            'published': activity.published,
            'primaryActor': primaryActor,
            'summary': summary
        };
        if ((activity['oae:activityType'] === 'content-comment' || activity['oae:activityType'] === 'discussion-message')) {
            that.allComments = activity.object['oae:collection'];
            that.latestComments = activity.object.latestComments;
        }

        return that;
    }

    /**
     * A model that holds the necessary data to generate a plain-text summary of an activity
     *
     * @param  {String}     i18nKey         The i18n key that should be used to generate the plain-text summary
     * @param  {Object}     properties      Any properties that can be used in the i18n value
     */
    var ActivityViewSummary = function(i18nKey, properties) {
        var that = {
            'i18nArguments': properties,
            'i18nKey': '__MSG__' + i18nKey + '__'
        };
        return that;
    };

    /**
     * A model that holds the necessary data to generate a beautiful tile
     *
     * @param  {ActivityEntity}     entity      The entity that should be used to generate the view
     */
    var ActivityViewItem = function(entity) {
        var that = {
            'id': entity.id,
            'displayName': entity.displayName,
            'profilePath': entity['oae:profilePath'],
            'resourceSubType': entity['oae:resourceSubType'],
            'resourceType': entity.objectType,
            'tenant': entity['oae:tenant'],
            'visibility': entity['oae:visibility']
        };

        if (entity.image && entity.image.url) {
            that.thumbnailUrl = entity.image.url;
        }
        if (entity['oae:wideImage'] && entity['oae:wideImage'].url) {
            that.wideImageUrl = entity['oae:wideImage'].url;
        }
        if (entity['oae:mimeType']) {
            that.mime = entity['oae:mimeType'];
        }

        return that;
    };


    //////////////////////////
    // Activity preparation //
    //////////////////////////

    /**
     * Prepare an activity (in-place) in such a way that:
     *  - actors with an image are ordered first
     *  - objects with an image are ordered first
     *  - targets with an image are ordered first
     *  - comments are processed into an ordered set
     *  - each comment is assigned the level in the comment tree
     *
     * @param  {Activity}   activity    The activity to prepare
     * @api private
     */
    var _prepareActivity = function(activity) {
        // Sort the entity collections based on whether or not they have a thumbnail
        if (activity.actor['oae:collection']) {
            // Reverse the items so the item that was changed last is shown first
            activity.actor['oae:collection'].reverse().sort(_sortEntityCollection);
        }

        if (activity.object && activity.object['oae:collection']) {
            // Reverse the items so the item that was changed last is shown first
            activity.object['oae:collection'].reverse().sort(_sortEntityCollection);
        }

        if (activity.target && activity.target['oae:collection']) {
            // Reverse the items so the item that was changed last is shown first
            activity.target['oae:collection'].reverse().sort(_sortEntityCollection);
        }

        // We process the comments into an ordered set
        if (activity['oae:activityType'] === 'content-comment' || activity['oae:activityType'] === 'discussion-message') {
            var comments = activity.object['oae:collection'];
            if (!comments) {
                comments = [activity.object];
            }
            // Keep track of the full list of comments on the activity. This will be used to check
            // whether or not all comments on the activity have made it into the final ordered list
            var originalComments = comments.slice();

            // Sort the comments based on the created timestamp
            comments.sort(_sortComments);

            // Construct a tree of the last 2 comments and their parents
            var latestComments = comments.slice().splice(0, 2);
            latestComments = _constructCommentTree(latestComments);

            // Convert these comments into an ordered tree that also includes the comments they were
            // replies to, if any
            var allComments = _constructCommentTree(comments);

            // Prepare each comment
            _.each(latestComments, function(comment) {
                comment.activityItem = new ActivityViewItem(comment.author);
            });
            _.each(allComments, function(comment) {
                comment.activityItem = new ActivityViewItem(comment.author);
            });

            activity.object.objectType = 'comments';
            activity.object['oae:collection'] = allComments;
            activity.object.latestComments = latestComments;
        }
    };

    /**
     * Sort entities based on whether or not they have a thumbnail. Entities with
     * thumbnails will be listed in front of those with no thumbnails, as we give
     * preference to these for UI rendering purposes.
     *
     * @see Array#sort
     * @api private
     */
    var _sortEntityCollection = function(a, b) {
        if (a.image && !b.image) {
            return -1;
        } else if (!a.image && b.image) {
            return 1;
        }
        return 0;
    };

    /**
     * Sort comments based on when they have been created. The comments list will be
     * ordered from new to old.
     *
     * @see Array#sort
     * @api private
     */
    var _sortComments = function(a, b) {
        // Threadkeys will have the following format, primarily to allow for proper thread ordering:
        //  - Top level comments: <createdTimeStamp>|
        //  - Reply: <parentCreatedTimeStamp>#<createdTimeStamp>|
        if (a['oae:threadKey'].split('#').pop() < b['oae:threadKey'].split('#').pop()) {
            return 1;
        } else {
            return -1;
        }
    };

    /**
     * Process a list of comments into an ordered tree that contains the comments they were replies to, if any,
     * as well as the level at which all of these comments need to be rendered.
     *
     * @param  {Comment[]}   comments   The array of latest comments to turn into an ordered tree
     * @return {Comment[]}              The ordered tree of comments with an `oae:level` property for each comment, representing the level at which they should be rendered
     * @api private
     */
    var _constructCommentTree = function(comments) {
        var orderedTree = [];

        // If the comment is a reply to a different comment, we add that comment to the ordered tree as well,
        // in order to provide some context for the current comment
        _.each(comments, function(comment) {
            // Check if the comment is already in the ordered tree, because of a reply to this comment
            var exists = _.findWhere(orderedTree, {'oae:id': comment['oae:id']});
            if (!exists) {
                if (comment.inReplyTo) {
                    // Check if the parent comment is already present in the ordered tree
                    var parentExists = _.findWhere(orderedTree, {'oae:id': comment.inReplyTo['oae:id']});
                    // If it isn't, we add it to the ordered list, just ahead of the current comment
                    if (!parentExists) {
                        orderedTree.push(comment.inReplyTo);
                    }
                }
                orderedTree.push(comment);
            }
        });

        // Now that all comments and the comments they were replies to are in the ordered list, we add a level
        // to each of them. These levels will be relative to each other, starting at 0 for top-level comments.
        _.each(orderedTree, function(comment) {
            comment['oae:level'] = 0;
            // If the comment is a reply to a comment, we set its level to be that of its parent + 1
            if (comment.inReplyTo) {
                var replyTo = _.findWhere(orderedTree, {'oae:id': comment.inReplyTo['oae:id']});
                comment['oae:level'] = replyTo['oae:level'] + 1;
            }

            // Ensure that the `published` timestamp is a number
            comment.published = parseInt(comment.published, 10);
        });

        return orderedTree;
    };


    ////////////////////
    // Activity views //
    ////////////////////

    /**
     * Get the primary view for an activity. This is usually the actor
     * or in case of an aggregated activity, the first in the collection of actors
     *
     * @param  {Activity}           activity    The activity for which to return the primary actor
     * @return {ActivityViewItem}               The object that identifies the primary actor
     * @api private
     */
    var _generatePrimaryActor = function(activity) {
        var actor = activity.actor;
        if (actor['oae:collection']) {
            actor = actor['oae:collection'][0];
        }

        return new ActivityViewItem(actor);
    };

    /**
     * Generate the views for the preview items
     *
     * @param  {String}                 context     The ID of the user or group that owns this activity stream
     * @param  {Activity}               activity    The activity for which to generate the views
     * @return {ActivityViewItem[]}                 The activity preview items
     * @api private
     */
    var _generateActivityItems = function(context, activity) {
        var previewObj = (activity.target || activity.object);
        if (activity.target && (activity.target.objectType === 'collection' || activity.target.objectType === 'content')) {
            previewObj = activity.target;
        } else if (activity.object.objectType === 'collection') {
            previewObj = activity.object;
        } else if (activity.actor.objectType === 'collection' && activity.object.objectType !== 'content') {
            previewObj = activity.actor
        } else if (activity.target && activity.target.objectType === 'content') {
            previewObj = activity.target;
        } else if (activity.object && activity.object.objectType === 'content') {
            previewObj = activity.object;
        }

        // Take the current context into account. For example, if the current user is viewing their 
        // own activity stream, we should show another entity in the thumbnail listing
        if (previewObj['oae:id'] === context) {
            if (activity.target) {
                previewObj = activity.object;
            } else {
                previewObj = activity.actor;
            }
        }

        var views = [];
        if (previewObj['oae:wideImage']) {
            views.push(new ActivityViewItem(previewObj));
        } else {
            var previewItems = (previewObj['oae:collection'] || [previewObj]);
            views = _.map(previewItems, function(previewItem) {
                return new ActivityViewItem(previewItem);
            });
        }

        return views;
    };


    ///////////////
    // Summaries //
    ///////////////

    /**
     * Given an activity, generate an approriate summary
     *
     * @param  {User}                   me                                      The currently loggedin user
     * @param  {Activity}               activity                                The activity for which to generate a summary
     * @param  {Object}                 sanitization                            An object that exposes basic HTML encoding functionality
     * @param  {Function}               sanitization.encodeForHTML              Encode a value such that it is safe to be embedded into an HTML tag
     * @param  {Function}               sanitization.encodeForHTMLAttribute     Encode a value such that it is safe to be embedded into an HTML attribute
     * @param  {Function}               sanitization.encodeForURL               Encode a value such that it is safe to be used as a URL fragment
     * @return {ActivityViewSummary}                                            The summary for the given activity
     * @api private
     */
    var _generateSummary = function(me, activity, sanitization) {
        // The dictionary that can be used to translate the dynamic values in the i18n keys
        var properties = {};

        // Prepare the actor-related variables that will be present in the i18n keys
        var actor1Obj = null;
        properties.actorCount = 1;
        if (activity.actor['oae:collection']) {
            actor1Obj = activity.actor['oae:collection'][0];
            if (activity.actor['oae:collection'].length > 1) {
                properties.actorCount = activity.actor['oae:collection'].length;
                properties.actorCountMinusOne = properties.actorCount - 1;
                properties.actor2 = sanitization.encodeForHTML(activity.actor['oae:collection'][1].displayName);
                properties.actor2URL = activity.actor['oae:collection'][1]['oae:profilePath'];
            }
        } else {
            actor1Obj = activity.actor;
        }
        properties.actor1 = sanitization.encodeForHTML(actor1Obj.displayName);
        properties.actor1URL = actor1Obj['oae:profilePath'];


        // Prepare the object-related variables that will be present in the i18n keys
        var object1Obj = null;
        properties.objectCount = 1;
        if (activity.object['oae:collection']) {
            object1Obj = activity.object['oae:collection'][0];
            if (activity.object['oae:collection'].length > 1) {
                properties.objectCount = activity.object['oae:collection'].length;
                properties.objectCountMinusOne = properties.objectCount - 1;
                properties.object2 = sanitization.encodeForHTML(activity.object['oae:collection'][1].displayName);
                properties.object2URL = activity.object['oae:collection'][1]['oae:profilePath'];
            }
        } else {
            object1Obj = activity.object;
        }
        properties.object1 = sanitization.encodeForHTML(object1Obj.displayName);
        properties.object1URL = object1Obj['oae:profilePath'];
        if (object1Obj['oae:tenant']) {
            properties.object1Tenant = sanitization.encodeForHTML(object1Obj['oae:tenant'].displayName);
        }

        // Prepare the target-related variables that will be present in the i18n keys
        var target1Obj = null;
        properties.targetCount = 1;
        if (activity.target) {
            if (activity.target['oae:collection']) {
                target1Obj = activity.target['oae:collection'][0];
                if (activity.target['oae:collection'].length > 1) {
                    properties.targetCount = activity.target['oae:collection'].length;
                    properties.targetCountMinusOne = properties.targetCount - 1;
                    properties.target2 = sanitization.encodeForHTML(activity.target['oae:collection'][1].displayName);
                    properties.target2URL = activity.target['oae:collection'][1]['oae:profilePath'];
                }
            } else {
                target1Obj = activity.target;
            }
            properties.target1 = sanitization.encodeForHTML(target1Obj.displayName);
            properties.target1URL = target1Obj['oae:profilePath'];
        }

        // Depending on the activity type, we render a different template that is specific to that activity,
        // to make sure that the summary is as accurate and descriptive as possible
        var activityType = activity['oae:activityType'];
        if (activityType === 'content-add-to-library') {
            return _generateContentAddToLibrarySummary(me, activity, properties);
        } else if (activityType === 'content-comment') {
            return _generateContentCommentSummary(me, activity, properties);
        } else if (activityType === 'content-create') {
            return _generateContentCreateSummary(me, activity, properties);
        } else if (activityType === 'content-restored-revision') {
            return _generateContentRestoredRevision(activity, properties);
        } else if (activityType === 'content-revision') {
            return _generateContentRevisionSummary(me, activity, properties);
        } else if (activityType === 'content-share') {
            return _generateContentShareSummary(me, activity, properties);
        } else if (activityType === 'content-update') {
            return _generateContentUpdateSummary(me, activity, properties);
        } else if (activityType === 'content-update-member-role') {
            return _generateContentUpdateMemberRoleSummary(me, activity, properties);
        } else if (activityType === 'content-update-visibility') {
            return _generateContentUpdateVisibilitySummary(me, activity, properties);
        } else if (activityType === 'discussion-add-to-library') {
            return _generateDiscussionAddToLibrarySummary(me, activity, properties);
        } else if (activityType === 'discussion-create') {
            return _generateDiscussionCreateSummary(me, activity, properties);
        } else if (activityType === 'discussion-message') {
            return _generateDiscussionMessageSummary(me, activity, properties);
        } else if (activityType === 'discussion-share') {
            return _generateDiscussionShareSummary(me, activity, properties);
        } else if (activityType === 'discussion-update') {
            return _generateDiscussionUpdateSummary(me, activity, properties);
        } else if (activityType === 'discussion-update-member-role') {
            return _generateDiscussionUpdateMemberRoleSummary(me, activity, properties);
        } else if (activityType === 'discussion-update-visibility') {
            return _generateDiscussionUpdateVisibilitySummary(me, activity, properties);
        } else if (activityType === 'following-follow') {
            return _generateFollowingSummary(me, activity, properties);
        } else if (activityType === 'group-add-member') {
            return _generateGroupAddMemberSummary(me, activity, properties);
        } else if (activityType === 'group-create') {
            return _generateGroupCreateSummary(me, activity, properties);
        } else if (activityType === 'group-join') {
            return _generateGroupJoinSummary(me, activity, properties);
        } else if (activityType === 'group-update') {
            return _generateGroupUpdateSummary(me, activity, properties);
        } else if (activityType === 'group-update-member-role') {
            return _generateGroupUpdateMemberRoleSummary(me, activity, properties);
        } else if (activityType === 'group-update-visibility') {
            return _generateGroupUpdateVisibilitySummary(me, activity, properties);
        // Fall back on the default activity summary if no specific template is found for the activity type
        } else {
            return _generateDefaultSummary(me, activity, properties);
        }
    };

    /**
     * Render the end-user friendly, internationalized summary of an activity for which no specific handling is available. This will
     * use the activity verb to construct the summary.
     *
     * @param  {Activity}               activity    Standard activity object as specified by the activitystrea.ms specification, representing the unrecognized activity, for which to generate the activity summary
     * @param  {Object}                 properties  A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                A sumary object
     * @api private
     */
    var _generateDefaultSummary = function(me, activity, properties) {
        var i18nKey = null;
        properties.verb = activity.verb;
        if (properties.actorCount === 1) {
            i18nKey = 'ACTIVITY_DEFAULT_1';
        } else if (properties.actorCount === 2) {
            i18nKey = 'ACTIVITY_DEFAULT_2';
        } else {
            i18nKey = 'ACTIVITY_DEFAULT_2+';
        }

        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of an add to content library activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateContentAddToLibrarySummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.objectCount === 1) {
            if (activity.object['oae:resourceSubType'] === 'collabdoc') {
                i18nKey = 'ACTIVITY_CONTENT_ADD_LIBRARY_COLLABDOC';
            } else if (activity.object['oae:resourceSubType'] === 'file') {
                i18nKey = 'ACTIVITY_CONTENT_ADD_LIBRARY_FILE';
            } else if (activity.object['oae:resourceSubType'] === 'link') {
                i18nKey = 'ACTIVITY_CONTENT_ADD_LIBRARY_LINK';
            }
        } else if (properties.objectCount === 2) {
            i18nKey = 'ACTIVITY_CONTENT_ADD_LIBRARY_2';
        } else {
            i18nKey = 'ACTIVITY_CONTENT_ADD_LIBRARY_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a content comment activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateContentCommentSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (activity.target['oae:resourceSubType'] === 'collabdoc') {
            if (properties.actorCount === 1) {
                i18nKey = 'ACTIVITY_CONTENT_COMMENT_COLLABDOC_1';
            } else if (properties.actorCount === 2) {
                i18nKey = 'ACTIVITY_CONTENT_COMMENT_COLLABDOC_2';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_COMMENT_COLLABDOC_2+';
            }
        } else if (activity.target['oae:resourceSubType'] === 'file') {
            if (properties.actorCount === 1) {
                i18nKey = 'ACTIVITY_CONTENT_COMMENT_FILE_1';
            } else if (properties.actorCount === 2) {
                i18nKey = 'ACTIVITY_CONTENT_COMMENT_FILE_2';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_COMMENT_FILE_2+';
            }
        } else if (activity.target['oae:resourceSubType'] === 'link') {
            if (properties.actorCount === 1) {
                i18nKey = 'ACTIVITY_CONTENT_COMMENT_LINK_1';
            } else if (properties.actorCount === 2) {
                i18nKey = 'ACTIVITY_CONTENT_COMMENT_LINK_2';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_COMMENT_LINK_2+';
            }
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a content creation activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateContentCreateSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.objectCount === 1) {
            if (activity.object['oae:resourceSubType'] === 'collabdoc') {
                i18nKey = 'ACTIVITY_CONTENT_CREATE_COLLABDOC';
            } else if (activity.object['oae:resourceSubType'] === 'file') {
                i18nKey = 'ACTIVITY_CONTENT_CREATE_FILE';
            } else if (activity.object['oae:resourceSubType'] === 'link') {
                i18nKey = 'ACTIVITY_CONTENT_CREATE_LINK';
            }
        } else if (properties.objectCount === 2) {
            i18nKey = 'ACTIVITY_CONTENT_CREATE_2';
        } else {
            i18nKey = 'ACTIVITY_CONTENT_CREATE_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a restored content revision activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateContentRestoredRevision = function(activity, properties) {
        var i18nKey = null;
        if (properties.objectCount === 1) {
            if (activity.object['oae:resourceSubType'] === 'collabdoc') {
                i18nKey = 'ACTIVITY_CONTENT_RESTORED_COLLABDOC';
            } else if (activity.object['oae:resourceSubType'] === 'file') {
                i18nKey = 'ACTIVITY_CONTENT_RESTORED_FILE';
            }
        } else if (properties.objectCount === 2) {
            i18nKey = 'ACTIVITY_CONTENT_RESTORED_2';
        } else {
            i18nKey = 'ACTIVITY_CONTENT_RESTORED_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a new content version activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateContentRevisionSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (activity.object['oae:resourceSubType'] === 'collabdoc') {
            if (properties.actorCount === 1) {
                i18nKey = 'ACTIVITY_CONTENT_REVISION_COLLABDOC_1';
            } else if (properties.actorCount === 2) {
                i18nKey = 'ACTIVITY_CONTENT_REVISION_COLLABDOC_2';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_REVISION_COLLABDOC_2+';
            }
        } else if (activity.object['oae:resourceSubType'] === 'file') {
            if (properties.actorCount === 1) {
                i18nKey = 'ACTIVITY_CONTENT_REVISION_FILE_1';
            } else if (properties.actorCount === 2) {
                i18nKey = 'ACTIVITY_CONTENT_REVISION_FILE_2';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_REVISION_FILE_2+';
            }
        } else if (activity.object['oae:resourceSubType'] === 'link') {
            if (properties.actorCount === 1) {
                i18nKey = 'ACTIVITY_CONTENT_REVISION_LINK_1';
            } else if (properties.actorCount === 2) {
                i18nKey = 'ACTIVITY_CONTENT_REVISION_LINK_2';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_REVISION_LINK_2+';
            }
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a content share activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateContentShareSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.objectCount === 1) {
            if (activity.object['oae:resourceSubType'] === 'collabdoc') {
                if (properties.targetCount === 1) {
                    if (activity.target['oae:id'] === me.id) {
                        i18nKey = 'ACTIVITY_CONTENT_SHARE_COLLABDOC_YOU';
                    } else {
                        i18nKey = 'ACTIVITY_CONTENT_SHARE_COLLABDOC_1';
                    }
                } else if (properties.targetCount === 2) {
                    i18nKey = 'ACTIVITY_CONTENT_SHARE_COLLABDOC_2';
                } else {
                    i18nKey = 'ACTIVITY_CONTENT_SHARE_COLLABDOC_2+';
                }
            } else if (activity.object['oae:resourceSubType'] === 'file') {
                if (properties.targetCount === 1) {
                   if (activity.target['oae:id'] === me.id) {
                        i18nKey = 'ACTIVITY_CONTENT_SHARE_FILE_YOU';
                    } else {
                        i18nKey = 'ACTIVITY_CONTENT_SHARE_FILE_1';
                    }
                } else if (properties.targetCount === 2) {
                    i18nKey = 'ACTIVITY_CONTENT_SHARE_FILE_2';
                } else {
                    i18nKey = 'ACTIVITY_CONTENT_SHARE_FILE_2+';
                }
            } else if (activity.object['oae:resourceSubType'] === 'link') {
                if (properties.targetCount === 1) {
                    if (activity.target['oae:id'] === me.id) {
                        i18nKey = 'ACTIVITY_CONTENT_SHARE_LINK_YOU';
                    } else {
                        i18nKey = 'ACTIVITY_CONTENT_SHARE_LINK_1';
                    }
                } else if (properties.targetCount === 2) {
                    i18nKey = 'ACTIVITY_CONTENT_SHARE_LINK_2';
                } else {
                    i18nKey = 'ACTIVITY_CONTENT_SHARE_LINK_2+';
                }
            }
        } else {
            if (properties.objectCount === 2) {
                if (activity.target['oae:id'] === me.id) {
                    i18nKey = 'ACTIVITY_CONTENT_SHARE_YOU_2';
                } else {
                    i18nKey = 'ACTIVITY_CONTENT_SHARE_2';
                }
            } else {
                if (activity.target['oae:id'] === me.id) {
                    i18nKey = 'ACTIVITY_CONTENT_SHARE_YOU_2+';
                } else {
                    i18nKey = 'ACTIVITY_CONTENT_SHARE_2+';
                }
            }
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a content member role update activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateContentUpdateMemberRoleSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (activity.target['oae:resourceSubType'] === 'collabdoc') {
            if (properties.objectCount === 1) {
                if (activity.object['oae:id'] === me.id) {
                    i18nKey = 'ACTIVITY_CONTENT_UPDATE_MEMBER_ROLE_COLLABDOC_YOU';
                } else {
                    i18nKey = 'ACTIVITY_CONTENT_UPDATE_MEMBER_ROLE_COLLABDOC_1';
                }
            } else if (properties.objectCount === 2) {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_MEMBER_ROLE_COLLABDOC_2';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_MEMBER_ROLE_COLLABDOC_2+';
            }
        } else if (activity.target['oae:resourceSubType'] === 'file') {
            if (properties.objectCount === 1) {
               if (activity.object['oae:id'] === me.id) {
                    i18nKey = 'ACTIVITY_CONTENT_UPDATE_MEMBER_ROLE_FILE_YOU';
                } else {
                    i18nKey = 'ACTIVITY_CONTENT_UPDATE_MEMBER_ROLE_FILE_1';
                }
            } else if (properties.objectCount === 2) {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_MEMBER_ROLE_FILE_2';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_MEMBER_ROLE_FILE_2+';
            }
        } else if (activity.target['oae:resourceSubType'] === 'link') {
            if (properties.objectCount === 1) {
                if (activity.object['oae:id'] === me.id) {
                    i18nKey = 'ACTIVITY_CONTENT_UPDATE_MEMBER_ROLE_LINK_YOU';
                } else {
                    i18nKey = 'ACTIVITY_CONTENT_UPDATE_MEMBER_ROLE_LINK_1';
                }
            } else if (properties.objectCount === 2) {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_MEMBER_ROLE_LINK_2';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_MEMBER_ROLE_LINK_2+';
            }
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a content update activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateContentUpdateSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (activity.object['oae:resourceSubType'] === 'collabdoc') {
            if (properties.actorCount === 1) {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_COLLABDOC_1';
            } else if (properties.actorCount === 2) {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_COLLABDOC_2';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_COLLABDOC_2+';
            }
        } else if (activity.object['oae:resourceSubType'] === 'file') {
            if (properties.actorCount === 1) {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_FILE_1';
            } else if (properties.actorCount === 2) {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_FILE_2';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_FILE_2+';
            }
        } else if (activity.object['oae:resourceSubType'] === 'link') {
            if (properties.actorCount === 1) {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_LINK_1';
            } else if (properties.actorCount === 2) {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_LINK_2';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_UPDATE_LINK_2+';
            }
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a visibility update activity for content.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateContentUpdateVisibilitySummary = function(me, activity, properties) {
        var i18nKey = null;
        if (activity.object['oae:resourceSubType'] === 'collabdoc') {
            if (activity.object['oae:visibility'] === 'public') {
                i18nKey = 'ACTIVITY_CONTENT_VISIBILITY_COLLABDOC_PUBLIC';
            } else if (activity.object['oae:visibility'] === 'loggedin') {
                i18nKey = 'ACTIVITY_CONTENT_VISIBILITY_COLLABDOC_LOGGEDIN';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_VISIBILITY_COLLABDOC_PRIVATE';
            }
        } else if (activity.object['oae:resourceSubType'] === 'file') {
            if (activity.object['oae:visibility'] === 'public') {
                i18nKey = 'ACTIVITY_CONTENT_VISIBILITY_FILE_PUBLIC';
            } else if (activity.object['oae:visibility'] === 'loggedin') {
                i18nKey = 'ACTIVITY_CONTENT_VISIBILITY_FILE_LOGGEDIN';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_VISIBILITY_FILE_PRIVATE';
            }
        } else if (activity.object['oae:resourceSubType'] === 'link') {
            if (activity.object['oae:visibility'] === 'public') {
                i18nKey = 'ACTIVITY_CONTENT_VISIBILITY_LINK_PUBLIC';
            } else if (activity.object['oae:visibility'] === 'loggedin') {
                i18nKey = 'ACTIVITY_CONTENT_VISIBILITY_LINK_LOGGEDIN';
            } else {
                i18nKey = 'ACTIVITY_CONTENT_VISIBILITY_LINK_PRIVATE';
            }
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of an add to library activity for a discussion.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateDiscussionAddToLibrarySummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.objectCount === 1) {
            i18nKey = 'ACTIVITY_DISCUSSION_ADD_LIBRARY';
        } else if (properties.objectCount === 2) {
            i18nKey = 'ACTIVITY_DISCUSSION_ADD_LIBRARY_2';
        } else {
            i18nKey = 'ACTIVITY_DISCUSSION_ADD_LIBRARY_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a discussion creation activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateDiscussionCreateSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.objectCount === 1) {
            i18nKey = 'ACTIVITY_DISCUSSION_CREATE_1';
        } else if (properties.objectCount === 2) {
            i18nKey = 'ACTIVITY_DISCUSSION_CREATE_2';
        } else {
            i18nKey = 'ACTIVITY_DISCUSSION_CREATE_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a discussion post activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateDiscussionMessageSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.actorCount === 1) {
            i18nKey = 'ACTIVITY_DISCUSSION_MESSAGE_1';
        } else if (properties.actorCount === 2) {
            i18nKey = 'ACTIVITY_DISCUSSION_MESSAGE_2';
        } else {
            i18nKey = 'ACTIVITY_DISCUSSION_MESSAGE_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a discussion share activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateDiscussionShareSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.objectCount === 1) {
            if (properties.targetCount === 1) {
                if (activity.target['oae:id'] === me.id) {
                    i18nKey = 'ACTIVITY_DISCUSSION_SHARE_YOU';
                } else {
                    i18nKey = 'ACTIVITY_DISCUSSION_SHARE_1';
                }
            } else if (properties.targetCount === 2) {
                i18nKey = 'ACTIVITY_DISCUSSION_SHARE_2';
            } else {
                i18nKey = 'ACTIVITY_DISCUSSION_SHARE_2+';
            }
        } else {
            if (properties.objectCount === 2) {
                i18nKey = 'ACTIVITY_DISCUSSION_SHARE_YOU_2';
            } else {
                i18nKey = 'ACTIVITY_DISCUSSION_SHARE_YOU_2+';
            }
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a discussion member role update activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateDiscussionUpdateMemberRoleSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.objectCount === 1) {
            if (activity.object['oae:id'] === me.id) {
                i18nKey = 'ACTIVITY_DISCUSSION_UPDATE_MEMBER_ROLE_YOU';
            } else {
                i18nKey = 'ACTIVITY_DISCUSSION_UPDATE_MEMBER_ROLE_1';
            }
        } else if (properties.objectCount === 2) {
            i18nKey = 'ACTIVITY_DISCUSSION_UPDATE_MEMBER_ROLE_2';
        } else {
            i18nKey = 'ACTIVITY_DISCUSSION_UPDATE_MEMBER_ROLE_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a discussion update activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateDiscussionUpdateSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.actorCount === 1) {
            i18nKey = 'ACTIVITY_DISCUSSION_UPDATE_1';
        } else if (properties.actorCount === 2) {
            i18nKey = 'ACTIVITY_DISCUSSION_UPDATE_2';
        } else {
            i18nKey = 'ACTIVITY_DISCUSSION_UPDATE_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a visibility update activity for a discussion.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateDiscussionUpdateVisibilitySummary = function(me, activity, properties) {
        var i18nKey = null;
        if (activity.object['oae:visibility'] === 'public') {
            i18nKey = 'ACTIVITY_DISCUSSION_VISIBILITY_PUBLIC';
        } else if (activity.object['oae:visibility'] === 'loggedin') {
            i18nKey = 'ACTIVITY_DISCUSSION_VISIBILITY_LOGGEDIN';
        } else {
            i18nKey = 'ACTIVITY_DISCUSSION_VISIBILITY_PRIVATE';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of an update for a user following another user
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateFollowingSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.actorCount > 1) {
            if (properties.actorCount === 2) {
                if (activity.object['oae:id'] === me.id) {
                    i18nKey = 'ACTIVITY_FOLLOWING_2_YOU';
                } else {
                    i18nKey = 'ACTIVITY_FOLLOWING_2_1';
                }
            } else {
                if (activity.object['oae:id'] === me.id) {
                    i18nKey = 'ACTIVITY_FOLLOWING_2+_YOU';
                } else {
                    i18nKey = 'ACTIVITY_FOLLOWING_2+_1';
                }
            }
        } else if (properties.objectCount > 1) {
            if (properties.objectCount === 2) {
                i18nKey = 'ACTIVITY_FOLLOWING_1_2';
            } else {
                i18nKey = 'ACTIVITY_FOLLOWING_1_2+';
            }
        } else {
            if (activity.object['oae:id'] === me.id) {
                i18nKey = 'ACTIVITY_FOLLOWING_1_YOU';
            } else {
                i18nKey = 'ACTIVITY_FOLLOWING_1_1';
            }
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a group member add activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateGroupAddMemberSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.objectCount === 1) {
            if (activity.object['oae:id'] === me.id) {
                i18nKey = 'ACTIVITY_GROUP_ADD_MEMBER_YOU';
            } else {
                i18nKey = 'ACTIVITY_GROUP_ADD_MEMBER_1';
            }
        } else if (properties.objectCount === 2) {
            i18nKey = 'ACTIVITY_GROUP_ADD_MEMBER_2';
        } else {
            i18nKey = 'ACTIVITY_GROUP_ADD_MEMBER_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a group member role update activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateGroupUpdateMemberRoleSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.objectCount === 1) {
            if (activity.object['oae:id'] === me.id) {
                i18nKey = 'ACTIVITY_GROUP_UPDATE_MEMBER_ROLE_YOU';
            } else {
                i18nKey = 'ACTIVITY_GROUP_UPDATE_MEMBER_ROLE_1';
            }
        } else if (properties.objectCount === 2) {
            i18nKey = 'ACTIVITY_GROUP_UPDATE_MEMBER_ROLE_2';
        } else {
            i18nKey = 'ACTIVITY_GROUP_UPDATE_MEMBER_ROLE_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a group creation activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateGroupCreateSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.objectCount === 1) {
            i18nKey = 'ACTIVITY_GROUP_CREATE_1';
        } else if (properties.objectCount === 2) {
            i18nKey = 'ACTIVITY_GROUP_CREATE_2';
        } else {
            i18nKey = 'ACTIVITY_GROUP_CREATE_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a group join activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateGroupJoinSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.actorCount === 1) {
            i18nKey = 'ACTIVITY_GROUP_JOIN_1';
        } else if (properties.actorCount === 2) {
            i18nKey = 'ACTIVITY_GROUP_JOIN_2';
        } else {
            i18nKey = 'ACTIVITY_GROUP_JOIN_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of a group update activity.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateGroupUpdateSummary = function(me, activity, properties) {
        var i18nKey = null;
        if (properties.actorCount === 1) {
            i18nKey = 'ACTIVITY_GROUP_UPDATE_1';
        } else if (properties.actorCount === 2) {
            i18nKey = 'ACTIVITY_GROUP_UPDATE_2';
        } else {
            i18nKey = 'ACTIVITY_GROUP_UPDATE_2+';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };

    /**
     * Render the end-user friendly, internationalized summary of  a visibility update activity for a group.
     *
     * @param  {Activity}               activity      Standard activity object as specified by the activitystrea.ms specification, representing the add to content library activity, for which to generate the activity summary
     * @param  {Object}                 properties    A set of properties that can be used to determine the correct summary
     * @return {ActivityViewSummary}                  A sumary object
     * @api private
     */
    var _generateGroupUpdateVisibilitySummary = function(me, activity, properties) {
        var i18nKey = null;
        if (activity.object['oae:visibility'] === 'public') {
            i18nKey = 'ACTIVITY_GROUP_VISIBILITY_PUBLIC';
        } else if (activity.object['oae:visibility'] === 'loggedin') {
            i18nKey = 'ACTIVITY_GROUP_VISIBILITY_LOGGEDIN';
        } else {
            i18nKey = 'ACTIVITY_GROUP_VISIBILITY_PRIVATE';
        }
        return new ActivityViewSummary(i18nKey, properties);
    };
};

(function() {
    if (typeof define !== 'function') {
        // This gets executed in the backend
        var _ = require('underscore');
        _expose(module.exports, _);
    } else {
        // This gets executed in the browser
        define(['exports', 'underscore'], _expose);
    }
})();
