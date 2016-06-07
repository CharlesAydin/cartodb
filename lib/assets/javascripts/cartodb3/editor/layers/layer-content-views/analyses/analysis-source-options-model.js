var _ = require('underscore');
var queueAsync = require('queue-async');
var Backbone = require('backbone');

/**
 * Analysis source options are not trivial to get and requires some coordination of events.
 *
 * It's intended to be fetched
 */
module.exports = Backbone.Model.extend({

  defaults: {
    fetching: false,
    layer_source_select_options: []
  },

  initialize: function (attrs, opts) {
    if (!opts.analysisDefinitionNodesCollection) throw new Error('analysisDefinitionNodesCollection is required');
    if (!opts.layerDefinitionsCollection) throw new Error('layerDefinitionsCollection is required');
    if (!opts.tablesCollection) throw new Error('layerDefinitionsCollection is required');

    this._layerDefinitionsCollection = opts.layerDefinitionsCollection;
    this._analysisDefinitionNodesCollection = opts.analysisDefinitionNodesCollection;
    this._tablesCollection = opts.tablesCollection;
  },

  fetch: function () {
    this.set({
      fetching: true,
      layer_source_select_options: []
    });

    var queue = queueAsync();

    this._fetchTables(queue);
    this._createLayerSourceOptions(queue);

    queue.awaitAll(function () {
      this.set('fetching', false);
    }.bind(this));
  },

  /**
   * @param {String, Array<String>} requiredSimpleGeometryTypes
   */
  getSelectOptions: function (requiredSimpleGeometryTypes) {
    if (this.get('fetching')) return [];

    if (_.isString(requiredSimpleGeometryTypes)) {
      requiredSimpleGeometryTypes = [requiredSimpleGeometryTypes];
    }

    var layerSourceOpts = this
      .get('layer_source_select_options')
      .filter(function (d) {
        return this._isValidGeometry(requiredSimpleGeometryTypes, d.simpleGeometryType);
      }, this);
    return layerSourceOpts.concat(this._getTablesSelectOptions(requiredSimpleGeometryTypes));
  },

  /**
   * @param {String} val val from select option
   */
  createSourceNodeUnlessExisting: function (val) {
    var tableModel = this._tablesCollection.get(val);

    // If there is no table with given val as id, then it must be a layer source which already exist, so nothing to do
    if (tableModel) {
      var tableName = tableModel.get('name');
      this._analysisDefinitionNodesCollection.add({
        id: tableName, // avoid duplicats
        type: 'source',
        params: {
          query: 'SELECT * FROM ' + tableName
        },
        options: {
          table_name: tableName
        }
      });
    }
  },

  _isValidGeometry: function (requiredSimpleGeometryTypes, simpleGeometryType) {
    return _.contains(requiredSimpleGeometryTypes, simpleGeometryType) || requiredSimpleGeometryTypes[0] === '*';
  },

  _fetchTables: function (queue) {
    queue.defer(function (cb) {
      this._tablesCollection.fetch();
      this._tablesCollection.once('sync error', function () {
        cb();
      });
    }.bind(this));
  },

  _createLayerSourceOptions: function (queue) {
    var layerSourceSelectOptions = this.get('layer_source_select_options');

    this._layerDefinitionsCollection
      .each(function (m) {
        var nodeDefModel = m.getAnalysisDefinitionNodeModel();
        var layerName = m.getName();

        if (nodeDefModel) {
          var querySchemaModel = nodeDefModel.querySchemaModel;

          queue.defer(function (cb) {
            if (!querySchemaModel.canFetch()) {
              cb();
              return;
            }

            var onStatusChange = function () {
              if (querySchemaModel.get('status') === 'fetching') return;
              querySchemaModel.off('change:status', onStatusChange);

              var geom = querySchemaModel.getGeometry();

              if (geom) {
                layerSourceSelectOptions.push({
                  simpleGeometryType: geom.getSimpleType(),
                  val: nodeDefModel.id,
                  label: nodeDefModel.id + ' (' + layerName + ')'
                });
              }

              cb();
            };
            querySchemaModel.on('change:status', onStatusChange);
            querySchemaModel.fetch();
          });
        }
      }, this);
  },

  _getTablesSelectOptions: function (requiredSimpleGeometryTypes) {
    return this._tablesCollection.reduce(function (memo, m) {
      var simpleGeometryType = m.getGeometryType()[0];

      if (this._isValidGeometry(requiredSimpleGeometryTypes, simpleGeometryType)) {
        memo.push({
          val: m.id,
          label: m.get('name')
        });
      }

      return memo;
    }, [], this);
  }

});