(function () {
  var CodeProcessor = require('./app/core/code-processor'),
    cp = new CodeProcessor();

  angular.module('content', [])

  .directive('pieContent', function () {
    return {
      restrict: 'E',
      templateUrl: 'app/frontend/view/content/pieContent.html',

      controller: function ($scope, $sce, $compile, CommomService) {
        var selectedRepository = {},
          selectedCommit = {},
          selectedCommitAncestor = null,
          MSGS = $scope.MSGS;

        this.loadingHistory = false;

        this.loadingChanges = false;

        this.repositories = CommomService.repositories;

        this.repositoryHistory = [];

        // List of files of the Changes tab
        this.commitChanges = [];

        // List of files of the History tab
        this.commitHistory = [];

        this.hideHeaderMenus = CommomService.hideHeaderMenu;

        if (this.repositories.length > 0) {
          this.isRepositoryMenuEmpty = false;
        }

        this.enableCommitBlock = null;

        this.showRepositoryInfo = function (repository, forceReload) {

          if (forceReload || selectedRepository.name != repository.name) {
            this.loadingHistory = true;

            if (selectedRepository) {
              selectedRepository.selected = false;
            }

            repository.selected = true;
            selectedRepository = repository;
            this.commitChanges = [];
            this.commitHistory = [];
            selectedCommit = {};

            GIT.getCommitHistory({
              path: repository.path
            }, function (err, historyList) {
              this.repositoryHistory = historyList;
              this.loadingHistory = false;

              $scope.$apply();
              $scope.$broadcast('repositorychanged', selectedRepository);

            }.bind(this));

            this.commitNumber = 'counting';

            GIT.getCommitCount(repository.path,function (err, size) {

              if (err) {
                alert(MSGS['Error counting commits. Error: '] + err);
              } else {
                this.commitNumber = size;
                $scope.$apply();
              }
            }.bind(this));
          }
        };

        this.showCommitChanges = function (commit, commitIndex) {
          var ancestorCommit = this.repositoryHistory[commitIndex+1] || {},

            opts = {
              hash: commit.hash,
              ancestorHash: ancestorCommit.hash || '',
              path: selectedRepository.path
            };

          selectedCommitAncestor = ancestorCommit;

          this.loadingChanges = true;

          if (selectedCommit) {
            selectedCommit.selected = false;
          }

          commit.selected = true;
          selectedCommit = commit;

          if (this.enableCommitBlock) {
            CommomService.changesTabPanel.select(0);
          }

          GIT.getDiff(opts, function (err, files) {
            this.commitHistory = [];

            files.forEach(function (file) {

              if (file.name) {

                if (!file.isBinary) {
                  var changesHTML = [];

                  if (file.additions > 0) {
                    changesHTML.push('<span class="plus-text">+', file.additions, '</span>');
                  }


                  if (file.deletions > 0) {
                    changesHTML.push('<span class="minor-text">-', file.deletions, '</span>');
                  }

                  file.changes = $sce.trustAsHtml(changesHTML.join(''));
                } else {
                  file.changes = $sce.trustAsHtml('<span class="label-binary">' + MSGS.BINARY + '</span>');
                }

                this.commitHistory.push(file);
              }
            }.bind(this));

            this.loadingChanges = false;

            $scope.$apply();
          }.bind(this));
        };

        this.getCommitMessage = function () {
          return selectedCommit.message;
        };

        this.getCommitHash = function () {
          return selectedCommit.hash;
        };

        this.getCommitUser = function () {
          return selectedCommit.user;
        };

        this.getCommitBody = function () {
          return selectedCommit.body;
        };

        this.showFileDiff = function (change) {

          if (!change.isUnsyc) {
            GIT.getFileDiff({

              file: change.name,
              hash: selectedCommit.hash,
              path: selectedRepository.path

            }, function (err, stdout) {

              if (err) {
                alert(err.message);
              } else {
                // change.code = $sce.trustAsHtml( prettyPrintOne(stdout) );
                change.code = $sce.trustAsHtml(cp.processCode( stdout ));

                if (change.showCode) {
                  change.showCode = false;
                } else {
                  change.showCode = true;
                }

                $scope.$apply();
              }
            });
          } else {

            GIT.getUnsyncFileDiff({
              path: selectedRepository.path,
              file: change.name
            },
            function (err, diff) {

              if (err) {
                alert(err);
              } else {
                // change.code = $sce.trustAsHtml( prettyPrintOne(diff) );
                change.code = $sce.trustAsHtml(cp.processCode( diff ));

                if (change.showCode) {
                  change.showCode = false;
                } else {
                  change.showCode = true;
                }
              }

              $scope.$apply();
            });
          }
        };

        this.commitSelectedChanges = function (commitMessage, commitDescription) {

          if (commitMessage) {
            var hasAddedFiles;

            this.commitChanges.forEach(function (file) {

              if (file.checked) {
                try {

                  GIT.add(selectedRepository.path, {
                    forceSync: true,
                    file: file.name
                  });

                  hasAddedFiles = true;
                } catch(err) {
                  alert(MSGS['Error adding file \'{fileName}\' Error: '].concat(err).replace('{fileName}', file.name));
                }
              }
            }.bind(this));

            if (hasAddedFiles) {

              try {

                GIT.commit(selectedRepository.path, {
                  message: commitMessage,
                  description: commitDescription,
                  forceSync: true
                });

                this.showRepositoryInfo(selectedRepository, true);
              } catch (err) {
                alert(MSGS['Error commiting changes. Error: '] + err);
              }

              $scope.commitMessage = null;
              $scope.commitDescription = null;
            }
          }
        };

        this.loadMoreCommits = function ($event) {
          var element = $event.srcElement,
            historyContainerHeight = element.scrollHeight - element.clientHeight;

          if (historyContainerHeight == element.scrollTop && this.repositoryHistory.length < parseInt( this.commitNumber )) {

            GIT.getCommitHistory({
              path: selectedRepository.path,
              skip: this.repositoryHistory.length
            }, function (err, historyList) {

              if (err) {
                alert(MSGS['Error getting more history. Error: '] + err.message);
              } else {
                this.repositoryHistory = this.repositoryHistory.concat(historyList);

                $scope.$apply();
              }

            }.bind(this));
          }
        }.bind(this);

        $scope.$on('changedbranch', function (event, repository) {
          this.showRepositoryInfo(repository, true);
        }.bind(this));

        $scope.$on('unsynChanges', function (event, files) {

          if (files.length > 0) {
            this.commitChanges = [];

            files.forEach(function (item) {
              item.name = item.path;
              item.isUnsyc = true;
              item.checked = true;

              this.commitChanges.push(item);
            }.bind(this));

            $scope.$apply();
          }
        }.bind(this));

        this.openRepositoryContextualMenu = function (event, repository, index) {
          var body = angular.element(document.body),
            contextMenu = $compile([

              '<div class="context-menu" style="top: ' + event.y + 'px;  left: ' + event.x +  'px">',
                '<ul>',
                  '<li ng-click="appCtrl.removeRepository(\'' + repository.type + '\', ' + index + ')">',
                    MSGS.Remove,
                  '</li>',
                  '<li ng-click="appCtrl.openItemInFolder(\'', repository.path , '\')">',
                    MSGS['Show in folder'],
                  '</li>',
                '</ul>',
              '</div>'

            ].join(''))($scope);

          CommomService.closeAnyContextMenu();

          body.append(contextMenu);
        };

        this.openChangesContextualMenu = function (event, change, index) {
          var body = angular.element(document.body),
            isUnknowChange = change.type == 'NEW',
            contextMenu = $compile([

              '<div class="context-menu" style="top: ' + event.y + 'px;  left: ' + event.x +  'px">',
                '<ul>',
                  '<li ng-click="appCtrl.discartChanges(\'', change.path,'\', \'', index,'\', ' + isUnknowChange + ')">',
                    MSGS.Discart,
                  '</li>',
                  '<li ng-click="appCtrl.assumeUnchanged(\'', change.path,'\', \'', index,'\')">',
                    MSGS['Assume unchanged'],
                  '</li>',
                  '<li ng-click="appCtrl.openItemInFolder(\'', selectedRepository.path + '/' + change.path + '\')">',
                    MSGS['Show file in folder'],
                  '</li>',
                '</ul>',
              '</div>'

            ].join(''))($scope);

          CommomService.closeAnyContextMenu();

          body.append(contextMenu);
        };

        this.getChangeTypeClass = function (type) {

          switch (type) {
            case 'MODIFIED':
              return 'label-modified';

            case 'DELETED':
              return  'label-deleted';

            case 'NEW':
                return  'label-new';

            default:
              return '';
          }
        };

        this.discartChanges = function (filePath, index, isUnknow) {
          var me = this;

          GIT.discartChangesInFile(selectedRepository.path, {

            file: filePath,

            isUnknow: isUnknow,

            callback: function (err) {

              if (err) {
                alert(err);
              } else {
                me.commitChanges.splice(index, 1);
                $scope.$apply();
              }

              CommomService.closeAnyContextMenu();

            }
          });
        };

        this.openItemInFolder = function (path) {
          GUI.Shell.showItemInFolder(path);

          CommomService.closeAnyContextMenu();
        };

        this.removeRepository = function (repositoryType, index) {
          var repositoryWasSelected = CommomService.removeRepository(repositoryType, index);

          if (repositoryWasSelected) {
            this.repositoryHistory = [];
          }

          CommomService.closeAnyContextMenu();
        };

        this.assumeUnchanged = function (filePath, index) {
          var me = this;

          GIT.assumeUnchanged(selectedRepository.path, {
            file: filePath,

            callback: function (err) {

              if (err) {
                alert(err);
              } else {
                me.commitChanges.splice(index, 1);
                $scope.$apply();
              }

              CommomService.closeAnyContextMenu();
            }
          });
        };

        this.onFocusCommitMessageInput = function () {

          if (!this.enableCommitBlock) {
            CommomService.changesTabPanel.select(1);
          }
        };
      },

      controllerAs: 'appCtrl'
    };
  });

})();
