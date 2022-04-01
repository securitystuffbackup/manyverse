// SPDX-FileCopyrightText: 2021-2022 The Manyverse Authors
//
// SPDX-License-Identifier: MPL-2.0

import xs, {Stream} from 'xstream';
import dropRepeats from 'xstream/extra/dropRepeats';
import {FeedId, PostContent} from 'ssb-typescript';
import {isFeedSSBURI, isMessageSSBURI} from 'ssb-uri2';
const Ref = require('ssb-ref');
import {GetReadable, SSBSource} from '~frontend/drivers/ssb';
import {MsgAndExtras, ThreadSummaryWithExtras} from '~frontend/ssb/types';
import {Props} from './props';

type SearchResults =
  | {
      type: 'feed';
      getReadable: GetReadable<ThreadSummaryWithExtras>;
    }
  | {
      type: 'posts';
      getReadable: GetReadable<MsgAndExtras<PostContent>>;
    };

export interface State {
  selfFeedId: FeedId;
  selfAvatarUrl?: string;
  lastSessionTimestamp: number;
  preferredReactions: Array<string>;
  query: string;
  queryOverride: string;
  queryOverrideFlag: number;
  queryInProgress: boolean;
  searchResults: SearchResults | null;
}

export interface Actions {
  updateQueryNow$: Stream<string>;
  updateQueryDebounced$: Stream<string>;
  clearQuery$: Stream<any>;
}

export default function model(
  props$: Stream<Props>,
  state$: Stream<State>,
  ssbSource: SSBSource,
  actions: Actions,
) {
  const propsReducer$ = props$.take(1).map(
    (props) =>
      function propsReducer(_prev?: State): State {
        return {
          selfFeedId: props.selfFeedId,
          selfAvatarUrl: props.selfAvatarUrl,
          lastSessionTimestamp: props.lastSessionTimestamp,
          preferredReactions: [],
          query: props.query ?? '',
          queryOverride: props.query ?? '',
          queryOverrideFlag: 0,
          queryInProgress: !!props.query,
          searchResults: null,
        };
      },
  );

  const updatePreferredReactionsReducer$ = ssbSource.preferredReactions$.map(
    (preferredReactions) =>
      function updatePreferredReactionsReducer(prev: State): State {
        return {...prev, preferredReactions};
      },
  );

  const updateQueryInProgressReducer$ = actions.updateQueryNow$.map(
    (query) =>
      function updateQueryInProgressReducer(prev: State): State {
        if (query.length > 0 && !query.startsWith('#')) {
          return {...prev, queryInProgress: true};
        } else if (query.length > 1 && query.startsWith('#')) {
          return {...prev, queryInProgress: true};
        } else {
          return {...prev, queryInProgress: false, searchResults: null};
        }
      },
  );

  const updateQueryReducer$ = actions.updateQueryDebounced$.map(
    (query) =>
      function updateQueryReducer(prev: State): State {
        if (
          Ref.isMsgId(query) ||
          Ref.isFeedId(query) ||
          isMessageSSBURI(query) ||
          isFeedSSBURI(query)
        ) {
          // In case of a shortcut to Thread or Account, clear the input field
          return {
            ...prev,
            query: '',
            queryOverride: '',
            queryOverrideFlag: 1 - prev.queryOverrideFlag,
            queryInProgress: false,
            searchResults: null,
          };
        } else {
          return {...prev, query};
        }
      },
  );

  const clearQueryReducer$ = actions.clearQuery$.mapTo(
    function clearQueryReducer(prev: State): State {
      return {
        ...prev,
        query: '',
        queryOverride: '',
        queryOverrideFlag: 1 - prev.queryOverrideFlag,
        queryInProgress: false,
        getResultsReadable: null,
        getFeedReadable: null,
      };
    },
  );

  const query$ = state$.map((state) => state.query).compose(dropRepeats());

  const updateResultsReducer$ = query$
    .filter((query) => !query.startsWith('#') && query.length > 1)
    .map((query) => ssbSource.searchPublicPosts$(query))
    .flatten()
    .map(
      (getResultsReadable) =>
        function updateResultsReducer(prev: State): State {
          return {
            ...prev,
            searchResults: {type: 'posts', getReadable: getResultsReadable},
          };
        },
    );

  const updateFeedReducer$ = query$
    .filter((query) => query.startsWith('#') && query.length > 1)
    .map((query) => ssbSource.searchPublishHashtagSummaries$(query))
    .flatten()
    .map(
      (getFeedReadable) =>
        function updateResultsReducer(prev: State): State {
          return {
            ...prev,
            searchResults: {type: 'feed', getReadable: getFeedReadable},
          };
        },
    );

  return xs.merge(
    propsReducer$,
    updatePreferredReactionsReducer$,
    updateQueryInProgressReducer$,
    updateQueryReducer$,
    clearQueryReducer$,
    updateResultsReducer$,
    updateFeedReducer$,
  );
}
