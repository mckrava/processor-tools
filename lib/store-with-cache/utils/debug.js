"use strict";
// const schemaMetaData = {
//   Account: {
//     kind: 'entity',
//     properties: {
//       id: { type: { kind: 'scalar', name: 'ID' }, nullable: false },
//       profileSpace: {
//         type: { kind: 'fk', entity: 'Space' },
//         nullable: true,
//         unique: false
//       },
//       followers: {
//         type: {
//           kind: 'list-lookup',
//           entity: 'AccountFollowers',
//           field: 'followingAccount'
//         },
//         nullable: false
//       },
//       followersCount: {
//         type: { kind: 'scalar', name: 'Int' },
//         nullable: false
//       },
//       followingAccounts: {
//         type: {
//           kind: 'list-lookup',
//           entity: 'AccountFollowers',
//           field: 'followerAccount'
//         },
//         nullable: false
//       },
//       followingAccountsCount: {
//         type: { kind: 'scalar', name: 'Int' },
//         nullable: false
//       },
//       posts: {
//         type: {
//           kind: 'list-lookup',
//           entity: 'Post',
//           field: 'createdByAccount'
//         },
//         nullable: false
//       },
//       followingPostsCount: {
//         type: { kind: 'scalar', name: 'Int' },
//         nullable: false
//       },
//       spacesCreated: {
//         type: {
//           kind: 'list-lookup',
//           entity: 'Space',
//           field: 'createdByAccount'
//         },
//         nullable: false
//       },
//       spacesOwned: {
//         type: { kind: 'list-lookup', entity: 'Space', field: 'ownedByAccount' },
//         nullable: false
//       },
//       spacesFollowed: {
//         type: {
//           kind: 'list-lookup',
//           entity: 'SpaceFollowers',
//           field: 'followerAccount'
//         },
//         nullable: false
//       },
//       followingSpacesCount: {
//         type: { kind: 'scalar', name: 'Int' },
//         nullable: false
//       },
//       feeds: {
//         type: { kind: 'list-lookup', entity: 'NewsFeed', field: 'account' },
//         nullable: false
//       },
//       notifications: {
//         type: { kind: 'list-lookup', entity: 'Notification', field: 'account' },
//         nullable: false
//       },
//       activities: {
//         type: { kind: 'list-lookup', entity: 'Activity', field: 'account' },
//         nullable: false
//       },
//       reactions: {
//         type: { kind: 'list-lookup', entity: 'Reaction', field: 'account' },
//         nullable: false
//       },
//       updatedAtTime: {
//         type: { kind: 'scalar', name: 'DateTime' },
//         nullable: true
//       },
//       updatedAtBlock: {
//         type: { kind: 'scalar', name: 'BigInt' },
//         nullable: true
//       }
//     },
//     interfaces: [],
//     indexes: []
//   },
//   Post: {
//     kind: 'entity',
//     properties: {
//       id: { type: { kind: 'scalar', name: 'ID' }, nullable: false },
//       parentPost: {
//         type: { kind: 'fk', entity: 'Post' },
//         nullable: true,
//         unique: false
//       },
//       rootPost: {
//         type: { kind: 'fk', entity: 'Post' },
//         nullable: true,
//         unique: false
//       },
//       sharedPost: {
//         type: { kind: 'fk', entity: 'Post' },
//         nullable: true,
//         unique: false
//       },
//       isComment: { type: { kind: 'scalar', name: 'Boolean' }, nullable: false },
//       hidden: { type: { kind: 'scalar', name: 'Boolean' }, nullable: false },
//       ownedByAccount: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       },
//       createdByAccount: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       },
//       createdAtBlock: {
//         type: { kind: 'scalar', name: 'BigInt' },
//         nullable: true
//       },
//       createdAtTime: {
//         type: { kind: 'scalar', name: 'DateTime' },
//         nullable: true
//       },
//       createdOnDay: {
//         type: { kind: 'scalar', name: 'DateTime' },
//         nullable: true
//       },
//       updatedAtTime: {
//         type: { kind: 'scalar', name: 'DateTime' },
//         nullable: true
//       },
//       space: {
//         type: { kind: 'fk', entity: 'Space' },
//         nullable: true,
//         unique: false
//       },
//       kind: { type: { kind: 'enum', name: 'PostKind' }, nullable: true },
//       postFollowers: {
//         type: {
//           kind: 'list-lookup',
//           entity: 'PostFollowers',
//           field: 'followingPost'
//         },
//         nullable: false
//       },
//       commentFollowers: {
//         type: {
//           kind: 'list-lookup',
//           entity: 'CommentFollowers',
//           field: 'followingComment'
//         },
//         nullable: false
//       },
//       followersCount: {
//         type: { kind: 'scalar', name: 'Int' },
//         nullable: false
//       },
//       repliesCount: { type: { kind: 'scalar', name: 'Int' }, nullable: false },
//       publicRepliesCount: {
//         type: { kind: 'scalar', name: 'Int' },
//         nullable: false
//       },
//       hiddenRepliesCount: {
//         type: { kind: 'scalar', name: 'Int' },
//         nullable: false
//       },
//       sharesCount: { type: { kind: 'scalar', name: 'Int' }, nullable: false },
//       upvotesCount: { type: { kind: 'scalar', name: 'Int' }, nullable: false },
//       downvotesCount: {
//         type: { kind: 'scalar', name: 'Int' },
//         nullable: false
//       },
//       reactionsCount: {
//         type: { kind: 'scalar', name: 'Int' },
//         nullable: false
//       },
//       reactions: {
//         type: { kind: 'list-lookup', entity: 'Reaction', field: 'post' },
//         nullable: false
//       },
//       title: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       image: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       link: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       canonical: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       content: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       slug: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       body: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       summary: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       meta: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       tagsOriginal: {
//         type: { kind: 'scalar', name: 'String' },
//         nullable: true
//       },
//       format: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       proposalIndex: { type: { kind: 'scalar', name: 'Int' }, nullable: true }
//     },
//     interfaces: [],
//     indexes: [
//       { fields: [{ name: 'isComment' }], unique: false },
//       { fields: [{ name: 'hidden' }], unique: false },
//       { fields: [{ name: 'createdAtTime' }], unique: false },
//       { fields: [{ name: 'kind' }], unique: false },
//       { fields: [{ name: 'followersCount' }], unique: false },
//       { fields: [{ name: 'publicRepliesCount' }], unique: false },
//       { fields: [{ name: 'sharesCount' }], unique: false },
//       { fields: [{ name: 'upvotesCount' }], unique: false },
//       { fields: [{ name: 'downvotesCount' }], unique: false },
//       { fields: [{ name: 'reactionsCount' }], unique: false }
//     ]
//   },
//   PostKind: {
//     kind: 'enum',
//     values: { Comment: {}, SharedPost: {}, RegularPost: {} }
//   },
//   Reaction: {
//     kind: 'entity',
//     properties: {
//       id: { type: { kind: 'scalar', name: 'ID' }, nullable: false },
//       post: {
//         type: { kind: 'fk', entity: 'Post' },
//         nullable: false,
//         unique: false
//       },
//       account: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       },
//       kind: { type: { kind: 'enum', name: 'ReactionKind' }, nullable: false },
//       status: { type: { kind: 'enum', name: 'Status' }, nullable: false },
//       createdAtBlock: {
//         type: { kind: 'scalar', name: 'BigInt' },
//         nullable: false
//       },
//       createdAtTime: {
//         type: { kind: 'scalar', name: 'DateTime' },
//         nullable: false
//       },
//       updatedAtBlock: {
//         type: { kind: 'scalar', name: 'BigInt' },
//         nullable: true
//       },
//       updatedAtTime: {
//         type: { kind: 'scalar', name: 'DateTime' },
//         nullable: true
//       }
//     },
//     interfaces: [],
//     indexes: [
//       { fields: [{ name: 'kind' }], unique: false },
//       { fields: [{ name: 'status' }], unique: false }
//     ]
//   },
//   ReactionKind: { kind: 'enum', values: { Upvote: {}, Downvote: {} } },
//   Status: { kind: 'enum', values: { Active: {}, Deleted: {} } },
//   Space: {
//     kind: 'entity',
//     properties: {
//       id: { type: { kind: 'scalar', name: 'ID' }, nullable: false },
//       createdByAccount: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       },
//       ownedByAccount: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       },
//       profileSpace: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: true,
//         unique: false
//       },
//       createdAtBlock: {
//         type: { kind: 'scalar', name: 'BigInt' },
//         nullable: true
//       },
//       createdAtTime: {
//         type: { kind: 'scalar', name: 'DateTime' },
//         nullable: true
//       },
//       createdOnDay: {
//         type: { kind: 'scalar', name: 'DateTime' },
//         nullable: true
//       },
//       updatedAtTime: {
//         type: { kind: 'scalar', name: 'DateTime' },
//         nullable: true
//       },
//       updatedAtBlock: {
//         type: { kind: 'scalar', name: 'BigInt' },
//         nullable: true
//       },
//       posts: {
//         type: { kind: 'list-lookup', entity: 'Post', field: 'space' },
//         nullable: false
//       },
//       postsCount: { type: { kind: 'scalar', name: 'Int' }, nullable: false },
//       publicPostsCount: {
//         type: { kind: 'scalar', name: 'Int' },
//         nullable: false
//       },
//       hiddenPostsCount: {
//         type: { kind: 'scalar', name: 'Int' },
//         nullable: false
//       },
//       hidden: { type: { kind: 'scalar', name: 'Boolean' }, nullable: false },
//       content: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       name: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       image: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       about: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       summary: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       email: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       tagsOriginal: {
//         type: { kind: 'scalar', name: 'String' },
//         nullable: true
//       },
//       linksOriginal: {
//         type: { kind: 'scalar', name: 'String' },
//         nullable: true
//       },
//       format: { type: { kind: 'scalar', name: 'String' }, nullable: true },
//       canFollowerCreatePosts: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       canEveryoneCreatePosts: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       nonePermissions: {
//         type: { kind: 'object', name: 'SpacePermissions' },
//         nullable: true
//       },
//       everyonePermissions: {
//         type: { kind: 'object', name: 'SpacePermissions' },
//         nullable: true
//       },
//       followerPermissions: {
//         type: { kind: 'object', name: 'SpacePermissions' },
//         nullable: true
//       },
//       spaceOwnerPermissions: {
//         type: { kind: 'object', name: 'SpacePermissions' },
//         nullable: true
//       },
//       followersCount: {
//         type: { kind: 'scalar', name: 'Int' },
//         nullable: false
//       },
//       followers: {
//         type: {
//           kind: 'list-lookup',
//           entity: 'SpaceFollowers',
//           field: 'followingSpace'
//         },
//         nullable: false
//       }
//     },
//     interfaces: [],
//     indexes: [
//       { fields: [{ name: 'createdAtTime' }], unique: false },
//       { fields: [{ name: 'publicPostsCount' }], unique: false },
//       { fields: [{ name: 'hidden' }], unique: false },
//       { fields: [{ name: 'followersCount' }], unique: false }
//     ]
//   },
//   SpacePermissions: {
//     kind: 'object',
//     properties: {
//       manageRoles: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       representSpaceInternally: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       representSpaceExternally: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       updateSpace: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       createSubspaces: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       updateOwnSubspaces: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       deleteOwnSubspaces: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       hideOwnSubspaces: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       updateAnySubspace: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       deleteAnySubspace: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       hideAnySubspace: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       createPosts: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       updateOwnPosts: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       deleteOwnPosts: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       hideOwnPosts: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       updateAnyPost: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       deleteAnyPost: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       hideAnyPost: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       createComments: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       updateOwnComments: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       deleteOwnComments: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       hideOwnComments: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       hideAnyComment: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       upvote: { type: { kind: 'scalar', name: 'Boolean' }, nullable: true },
//       downvote: { type: { kind: 'scalar', name: 'Boolean' }, nullable: true },
//       share: { type: { kind: 'scalar', name: 'Boolean' }, nullable: true },
//       overrideSubspacePermissions: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       overridePostPermissions: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       suggestEntityStatus: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       updateEntityStatus: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       },
//       updateSpaceSettings: {
//         type: { kind: 'scalar', name: 'Boolean' },
//         nullable: true
//       }
//     },
//     interfaces: []
//   },
//   Activity: {
//     kind: 'entity',
//     properties: {
//       id: { type: { kind: 'scalar', name: 'ID' }, nullable: false },
//       account: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       },
//       blockNumber: {
//         type: { kind: 'scalar', name: 'BigInt' },
//         nullable: false
//       },
//       eventIndex: { type: { kind: 'scalar', name: 'Int' }, nullable: false },
//       event: { type: { kind: 'enum', name: 'EventName' }, nullable: false },
//       followingAccount: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: true,
//         unique: false
//       },
//       space: {
//         type: { kind: 'fk', entity: 'Space' },
//         nullable: true,
//         unique: false
//       },
//       spacePrev: {
//         type: { kind: 'fk', entity: 'Space' },
//         nullable: true,
//         unique: false
//       },
//       post: {
//         type: { kind: 'fk', entity: 'Post' },
//         nullable: true,
//         unique: false
//       },
//       reaction: {
//         type: { kind: 'fk', entity: 'Reaction' },
//         nullable: true,
//         unique: false
//       },
//       date: { type: { kind: 'scalar', name: 'DateTime' }, nullable: false },
//       aggregated: { type: { kind: 'scalar', name: 'Boolean' }, nullable: true },
//       aggCount: { type: { kind: 'scalar', name: 'BigInt' }, nullable: false }
//     },
//     interfaces: [],
//     indexes: [
//       { fields: [{ name: 'event' }], unique: false },
//       { fields: [{ name: 'aggregated' }], unique: false }
//     ]
//   },
//   EventName: {
//     kind: 'enum',
//     values: {
//       PostCreated: {},
//       PostDeleted: {},
//       PostUpdated: {},
//       PostShared: {},
//       PostMoved: {},
//       PostReactionCreated: {},
//       PostReactionUpdated: {},
//       PostReactionDeleted: {},
//       SpaceCreated: {},
//       SpaceUpdated: {},
//       SpaceFollowed: {},
//       SpaceUnfollowed: {},
//       AccountFollowed: {},
//       AccountUnfollowed: {},
//       ProfileUpdated: {},
//       CommentCreated: {},
//       CommentDeleted: {},
//       CommentUpdated: {},
//       CommentShared: {},
//       CommentReactionCreated: {},
//       CommentReactionUpdated: {},
//       CommentReactionDeleted: {},
//       CommentReplyCreated: {},
//       CommentReplyDeleted: {},
//       CommentReplyUpdated: {},
//       CommentReplyShared: {},
//       CommentReplyReactionCreated: {},
//       CommentReplyReactionUpdated: {},
//       CommentReplyReactionDeleted: {}
//     }
//   },
//   AccountFollowers: {
//     kind: 'entity',
//     properties: {
//       id: { type: { kind: 'scalar', name: 'ID' }, nullable: false },
//       followerAccount: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       },
//       followingAccount: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       }
//     },
//     interfaces: [],
//     indexes: []
//   },
//   SpaceFollowers: {
//     kind: 'entity',
//     properties: {
//       id: { type: { kind: 'scalar', name: 'ID' }, nullable: false },
//       followerAccount: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       },
//       followingSpace: {
//         type: { kind: 'fk', entity: 'Space' },
//         nullable: false,
//         unique: false
//       }
//     },
//     interfaces: [],
//     indexes: []
//   },
//   PostFollowers: {
//     kind: 'entity',
//     properties: {
//       id: { type: { kind: 'scalar', name: 'ID' }, nullable: false },
//       followerAccount: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       },
//       followingPost: {
//         type: { kind: 'fk', entity: 'Post' },
//         nullable: false,
//         unique: false
//       }
//     },
//     interfaces: [],
//     indexes: []
//   },
//   CommentFollowers: {
//     kind: 'entity',
//     properties: {
//       id: { type: { kind: 'scalar', name: 'ID' }, nullable: false },
//       followerAccount: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       },
//       followingComment: {
//         type: { kind: 'fk', entity: 'Post' },
//         nullable: false,
//         unique: false
//       }
//     },
//     interfaces: [],
//     indexes: []
//   },
//   NewsFeed: {
//     kind: 'entity',
//     properties: {
//       id: { type: { kind: 'scalar', name: 'ID' }, nullable: false },
//       account: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       },
//       activity: {
//         type: { kind: 'fk', entity: 'Activity' },
//         nullable: false,
//         unique: false
//       }
//     },
//     interfaces: [],
//     indexes: []
//   },
//   Notification: {
//     kind: 'entity',
//     properties: {
//       id: { type: { kind: 'scalar', name: 'ID' }, nullable: false },
//       account: {
//         type: { kind: 'fk', entity: 'Account' },
//         nullable: false,
//         unique: false
//       },
//       activity: {
//         type: { kind: 'fk', entity: 'Activity' },
//         nullable: false,
//         unique: false
//       }
//     },
//     interfaces: [],
//     indexes: []
//   }
// };
//
// (() => {
//   // @ts-nocheck
//
//   function sortRelations(originalList: Map<string, number>) {
//     const sorted = [...originalList.entries()].sort((a, b) =>
//       a[1] > b[1] ? -1 : b[1] > a[1] ? 1 : 0
//     );
//
//     return new Map(sorted);
//   }
//
//   const entities = new Map<string, unknown>();
//   let fkList = [];
//   const fkMap = new Map<string, number>();
//   const entitiesListFull = [];
//
//   for (const name in schemaMetaData) {
//     // @ts-ignore
//     const item = schemaMetaData[name];
//     if (item.kind !== 'entity') continue;
//     const entityRelations = new Map<string, unknown>();
//     entitiesListFull.push(name);
//     for (const propName in item.properties) {
//       const propData = item.properties[propName];
//       if (propData.type.kind === 'list-lookup' || propData.type.kind === 'fk')
//         entityRelations.set(propName, propData);
//       if (propData.type.kind === 'fk') {
//         fkList.push(propData.type.entity);
//       }
//       if (propData.type.kind === 'fk' && !propData.nullable) {
//         const relEntity = propData.type.entity;
//         fkMap.set(relEntity, (fkMap.get(relEntity) || 0) + 1);
//       }
//     }
//
//     entities.set(name, entityRelations);
//   }
//   fkMap.forEach((val, key, map) => map.set(key, val * 1000));
//
//   fkList
//     .filter(item => !fkMap.has(item))
//     .forEach(item => fkMap.set(item, (fkMap.get(item) || 0) + 1));
//
//   const fullList = [
//     ...sortRelations(fkMap).keys(),
//     ...entitiesListFull.filter(item => !fkMap.has(item))
//   ];
//
//   // console.log(fkList);
//   // console.log(fkMap);
//   // console.log(sortRelations(fkMap));
//   console.log(entitiesListFull)
//   console.log(fullList);
// })();
//# sourceMappingURL=debug.js.map