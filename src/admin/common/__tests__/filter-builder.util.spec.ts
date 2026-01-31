import { FilterBuilder } from '../utils/filter-builder.util';
import { FilterOperator, LogicalOperator, FilterGroup, FilterCondition } from '../dto/advanced-filter.dto';

describe('FilterBuilder', () => {
  describe('buildConditionQuery', () => {
    it('should build equals query', () => {
      const condition: FilterCondition = {
        field: 'status',
        operator: FilterOperator.EQUALS,
        value: 'active',
      };

      const query = FilterBuilder['buildConditionQuery'](condition);
      expect(query).toEqual({ status: 'active' });
    });

    it('should build contains query', () => {
      const condition: FilterCondition = {
        field: 'name',
        operator: FilterOperator.CONTAINS,
        value: 'john',
      };

      const query = FilterBuilder['buildConditionQuery'](condition);
      expect(query).toHaveProperty('name');
      expect(query.name).toHaveProperty('$regex');
      expect(query.name).toHaveProperty('$options', 'i');
    });

    it('should build in query', () => {
      const condition: FilterCondition = {
        field: 'status',
        operator: FilterOperator.IN,
        value: ['active', 'pending'],
      };

      const query = FilterBuilder['buildConditionQuery'](condition);
      expect(query).toEqual({ status: { $in: ['active', 'pending'] } });
    });

    it('should build greater than query', () => {
      const condition: FilterCondition = {
        field: 'age',
        operator: FilterOperator.GREATER_THAN,
        value: 18,
      };

      const query = FilterBuilder['buildConditionQuery'](condition);
      expect(query).toEqual({ age: { $gt: 18 } });
    });

    it('should build between query', () => {
      const condition: FilterCondition = {
        field: 'price',
        operator: FilterOperator.BETWEEN,
        value: [10, 100],
      };

      const query = FilterBuilder['buildConditionQuery'](condition);
      expect(query).toEqual({ price: { $gte: 10, $lte: 100 } });
    });
  });

  describe('buildQuery', () => {
    it('should build AND query with multiple conditions', () => {
      const filterGroup: FilterGroup = {
        operator: LogicalOperator.AND,
        conditions: [
          { field: 'status', operator: FilterOperator.EQUALS, value: 'active' },
          { field: 'age', operator: FilterOperator.GREATER_THAN, value: 18 },
        ],
      };

      const query = FilterBuilder.buildQuery(filterGroup);
      expect(query).toHaveProperty('$and');
      expect(query.$and).toHaveLength(2);
    });

    it('should build OR query with multiple conditions', () => {
      const filterGroup: FilterGroup = {
        operator: LogicalOperator.OR,
        conditions: [
          { field: 'status', operator: FilterOperator.EQUALS, value: 'active' },
          { field: 'status', operator: FilterOperator.EQUALS, value: 'pending' },
        ],
      };

      const query = FilterBuilder.buildQuery(filterGroup);
      expect(query).toHaveProperty('$or');
      expect(query.$or).toHaveLength(2);
    });

    it('should handle nested filter groups', () => {
      const filterGroup: FilterGroup = {
        operator: LogicalOperator.AND,
        conditions: [
          { field: 'status', operator: FilterOperator.EQUALS, value: 'active' },
        ],
        groups: [
          {
            operator: LogicalOperator.OR,
            conditions: [
              { field: 'role', operator: FilterOperator.EQUALS, value: 'admin' },
              { field: 'role', operator: FilterOperator.EQUALS, value: 'moderator' },
            ],
          },
        ],
      };

      const query = FilterBuilder.buildQuery(filterGroup);
      expect(query).toHaveProperty('$and');
      expect(query.$and).toHaveLength(2);
    });

    it('should return empty query for undefined filter group', () => {
      const query = FilterBuilder.buildQuery(undefined);
      expect(query).toEqual({});
    });
  });

  describe('buildSearchQuery', () => {
    it('should build search query for multiple fields', () => {
      const query = FilterBuilder.buildSearchQuery('john', ['name', 'email']);
      expect(query).toHaveProperty('$or');
      expect(query.$or).toHaveLength(2);
    });

    it('should return empty query for no search term', () => {
      const query = FilterBuilder.buildSearchQuery(undefined, ['name', 'email']);
      expect(query).toEqual({});
    });

    it('should return empty query for no search fields', () => {
      const query = FilterBuilder.buildSearchQuery('john', []);
      expect(query).toEqual({});
    });
  });

  describe('buildDateRangeQuery', () => {
    it('should build date range query', () => {
      const query = FilterBuilder.buildDateRangeQuery({
        createdAt: {
          startDate: '2024-01-01',
          endDate: '2024-12-31',
        },
      });

      expect(query).toHaveProperty('createdAt');
      expect(query.createdAt).toHaveProperty('$gte');
      expect(query.createdAt).toHaveProperty('$lte');
    });

    it('should handle only start date', () => {
      const query = FilterBuilder.buildDateRangeQuery({
        createdAt: {
          startDate: '2024-01-01',
        },
      });

      expect(query).toHaveProperty('createdAt');
      expect(query.createdAt).toHaveProperty('$gte');
      expect(query.createdAt).not.toHaveProperty('$lte');
    });

    it('should return empty query for undefined date ranges', () => {
      const query = FilterBuilder.buildDateRangeQuery(undefined);
      expect(query).toEqual({});
    });
  });

  describe('buildNumberRangeQuery', () => {
    it('should build number range query', () => {
      const query = FilterBuilder.buildNumberRangeQuery({
        price: {
          min: 10,
          max: 100,
        },
      });

      expect(query).toHaveProperty('price');
      expect(query.price).toHaveProperty('$gte', 10);
      expect(query.price).toHaveProperty('$lte', 100);
    });

    it('should handle only min value', () => {
      const query = FilterBuilder.buildNumberRangeQuery({
        price: {
          min: 10,
        },
      });

      expect(query).toHaveProperty('price');
      expect(query.price).toHaveProperty('$gte', 10);
      expect(query.price).not.toHaveProperty('$lte');
    });

    it('should return empty query for undefined number ranges', () => {
      const query = FilterBuilder.buildNumberRangeQuery(undefined);
      expect(query).toEqual({});
    });
  });

  describe('buildSort', () => {
    it('should build sort object', () => {
      const sort = FilterBuilder.buildSort({
        sorts: [
          { field: 'createdAt', order: 'desc' },
          { field: 'name', order: 'asc' },
        ],
      });

      expect(sort).toEqual({
        createdAt: -1,
        name: 1,
      });
    });

    it('should return empty object for undefined sort config', () => {
      const sort = FilterBuilder.buildSort(undefined);
      expect(sort).toEqual({});
    });
  });

  describe('combineQueries', () => {
    it('should combine multiple queries', () => {
      const query1 = { status: 'active' };
      const query2 = { age: { $gt: 18 } };

      const combined = FilterBuilder.combineQueries(query1, query2);
      expect(combined).toHaveProperty('$and');
      expect(combined.$and).toHaveLength(2);
    });

    it('should return single query if only one provided', () => {
      const query1 = { status: 'active' };

      const combined = FilterBuilder.combineQueries(query1);
      expect(combined).toEqual(query1);
    });

    it('should return empty query for no queries', () => {
      const combined = FilterBuilder.combineQueries();
      expect(combined).toEqual({});
    });
  });

  describe('validateFields', () => {
    it('should validate allowed fields', () => {
      const filterGroup: FilterGroup = {
        operator: LogicalOperator.AND,
        conditions: [
          { field: 'status', operator: FilterOperator.EQUALS, value: 'active' },
          { field: 'name', operator: FilterOperator.CONTAINS, value: 'john' },
        ],
      };

      const result = FilterBuilder.validateFields(filterGroup, ['status', 'name', 'email']);
      expect(result.valid).toBe(true);
      expect(result.invalidFields).toHaveLength(0);
    });

    it('should detect invalid fields', () => {
      const filterGroup: FilterGroup = {
        operator: LogicalOperator.AND,
        conditions: [
          { field: 'status', operator: FilterOperator.EQUALS, value: 'active' },
          { field: 'password', operator: FilterOperator.CONTAINS, value: 'test' },
        ],
      };

      const result = FilterBuilder.validateFields(filterGroup, ['status', 'name', 'email']);
      expect(result.valid).toBe(false);
      expect(result.invalidFields).toContain('password');
    });
  });

  describe('buildCompleteQuery', () => {
    it('should build complete query with all filter types', () => {
      const query = FilterBuilder.buildCompleteQuery({
        filters: {
          operator: LogicalOperator.AND,
          conditions: [
            { field: 'status', operator: FilterOperator.EQUALS, value: 'active' },
          ],
        },
        search: 'john',
        searchFields: ['name', 'email'],
        dateRanges: {
          createdAt: {
            startDate: '2024-01-01',
            endDate: '2024-12-31',
          },
        },
        numberRanges: {
          age: {
            min: 18,
            max: 65,
          },
        },
      });

      expect(query).toHaveProperty('$and');
      expect(query.$and.length).toBeGreaterThan(0);
    });

    it('should return empty query for no filters', () => {
      const query = FilterBuilder.buildCompleteQuery({});
      expect(query).toEqual({});
    });
  });
});
