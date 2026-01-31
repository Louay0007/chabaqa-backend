import { Injectable, BadRequestException } from '@nestjs/common';
import { validate, ValidationError as ClassValidatorError } from 'class-validator';
import {
  FieldValidationError,
  ValidationResultDto,
  ValidationErrorCode,
  ValidationSeverity,
} from '../dto/validation-error.dto';

/**
 * Validation rule interface
 */
export interface ValidationRule {
  field: string;
  validate: (value: any, data?: any) => Promise<boolean> | boolean;
  message: string;
  code: ValidationErrorCode;
  severity?: ValidationSeverity;
}

/**
 * Field constraint interface
 */
export interface FieldConstraints {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'url' | 'array' | 'object';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any) => boolean | Promise<boolean>;
  customMessage?: string;
}

/**
 * Service for comprehensive data validation
 */
@Injectable()
export class ValidationService {
  /**
   * Validate data against field constraints
   */
  async validateData(
    data: Record<string, any>,
    constraints: Record<string, FieldConstraints>
  ): Promise<ValidationResultDto> {
    const errors: FieldValidationError[] = [];
    const warnings: FieldValidationError[] = [];

    for (const [field, constraint] of Object.entries(constraints)) {
      const value = data[field];
      const fieldErrors = await this.validateField(field, value, constraint, data);

      fieldErrors.forEach((error) => {
        if (error.severity === ValidationSeverity.WARNING) {
          warnings.push(error);
        } else {
          errors.push(error);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      errorCount: errors.length,
      warningCount: warnings.length,
      message: this.buildValidationMessage(errors, warnings),
    };
  }

  /**
   * Validate a single field
   */
  private async validateField(
    field: string,
    value: any,
    constraint: FieldConstraints,
    data?: Record<string, any>
  ): Promise<FieldValidationError[]> {
    const errors: FieldValidationError[] = [];

    // Required validation
    if (constraint.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field,
        message: `${field} is required`,
        code: ValidationErrorCode.REQUIRED_FIELD,
        value,
        severity: ValidationSeverity.ERROR,
      });
      return errors; // Skip other validations if required field is missing
    }

    // Skip other validations if value is not provided and not required
    if (value === undefined || value === null) {
      return errors;
    }

    // Type validation
    if (constraint.type) {
      const typeError = this.validateType(field, value, constraint.type);
      if (typeError) {
        errors.push(typeError);
        return errors; // Skip other validations if type is wrong
      }
    }

    // String validations
    if (typeof value === 'string') {
      if (constraint.minLength !== undefined && value.length < constraint.minLength) {
        errors.push({
          field,
          message: `${field} must be at least ${constraint.minLength} characters`,
          code: ValidationErrorCode.TOO_SHORT,
          value,
          context: { minLength: constraint.minLength, actualLength: value.length },
        });
      }

      if (constraint.maxLength !== undefined && value.length > constraint.maxLength) {
        errors.push({
          field,
          message: `${field} must not exceed ${constraint.maxLength} characters`,
          code: ValidationErrorCode.TOO_LONG,
          value,
          context: { maxLength: constraint.maxLength, actualLength: value.length },
        });
      }

      if (constraint.pattern && !constraint.pattern.test(value)) {
        errors.push({
          field,
          message: `${field} format is invalid`,
          code: ValidationErrorCode.INVALID_FORMAT,
          value,
          context: { pattern: constraint.pattern.toString() },
        });
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (constraint.min !== undefined && value < constraint.min) {
        errors.push({
          field,
          message: `${field} must be at least ${constraint.min}`,
          code: ValidationErrorCode.OUT_OF_RANGE,
          value,
          context: { min: constraint.min },
        });
      }

      if (constraint.max !== undefined && value > constraint.max) {
        errors.push({
          field,
          message: `${field} must not exceed ${constraint.max}`,
          code: ValidationErrorCode.OUT_OF_RANGE,
          value,
          context: { max: constraint.max },
        });
      }
    }

    // Enum validation
    if (constraint.enum && !constraint.enum.includes(value)) {
      errors.push({
        field,
        message: `${field} must be one of: ${constraint.enum.join(', ')}`,
        code: ValidationErrorCode.INVALID_ENUM,
        value,
        context: { allowedValues: constraint.enum },
      });
    }

    // Custom validation
    if (constraint.custom) {
      try {
        const isValid = await constraint.custom(value);
        if (!isValid) {
          errors.push({
            field,
            message: constraint.customMessage || `${field} failed custom validation`,
            code: ValidationErrorCode.CUSTOM_VALIDATION,
            value,
          });
        }
      } catch (error) {
        errors.push({
          field,
          message: `${field} validation error: ${error.message}`,
          code: ValidationErrorCode.CUSTOM_VALIDATION,
          value,
        });
      }
    }

    return errors;
  }

  /**
   * Validate type
   */
  private validateType(
    field: string,
    value: any,
    expectedType: string
  ): FieldValidationError | null {
    let isValid = false;
    let actualType = typeof value;

    switch (expectedType) {
      case 'string':
        isValid = typeof value === 'string';
        break;
      case 'number':
        isValid = typeof value === 'number' && !isNaN(value);
        break;
      case 'boolean':
        isValid = typeof value === 'boolean';
        break;
      case 'date':
        isValid = value instanceof Date || !isNaN(Date.parse(value));
        actualType = 'object'; // Date is an object type
        break;
      case 'email':
        isValid = typeof value === 'string' && this.isValidEmail(value);
        actualType = 'string'; // Email is a string type
        break;
      case 'url':
        isValid = typeof value === 'string' && this.isValidUrl(value);
        actualType = 'string'; // URL is a string type
        break;
      case 'array':
        isValid = Array.isArray(value);
        actualType = 'object'; // Array is an object type
        break;
      case 'object':
        isValid = typeof value === 'object' && value !== null && !Array.isArray(value);
        actualType = 'object';
        break;
      default:
        isValid = true;
    }

    if (!isValid) {
      return {
        field,
        message: `${field} must be of type ${expectedType}`,
        code: ValidationErrorCode.INVALID_TYPE,
        value,
        context: { expectedType, actualType },
      };
    }

    return null;
  }

  /**
   * Validate using class-validator decorators
   */
  async validateDto(dto: any): Promise<ValidationResultDto> {
    const validationErrors = await validate(dto);

    if (validationErrors.length === 0) {
      return {
        valid: true,
        errors: [],
        errorCount: 0,
        warningCount: 0,
      };
    }

    const errors = this.convertClassValidatorErrors(validationErrors);

    return {
      valid: false,
      errors,
      errorCount: errors.length,
      warningCount: 0,
      message: this.buildValidationMessage(errors, []),
    };
  }

  /**
   * Convert class-validator errors to our format
   */
  private convertClassValidatorErrors(
    validationErrors: ClassValidatorError[]
  ): FieldValidationError[] {
    const errors: FieldValidationError[] = [];

    validationErrors.forEach((error) => {
      if (error.constraints) {
        Object.entries(error.constraints).forEach(([constraint, message]) => {
          errors.push({
            field: error.property,
            message,
            code: this.mapConstraintToCode(constraint),
            value: error.value,
          });
        });
      }

      // Handle nested validation errors
      if (error.children && error.children.length > 0) {
        const nestedErrors = this.convertClassValidatorErrors(error.children);
        nestedErrors.forEach((nestedError) => {
          nestedError.field = `${error.property}.${nestedError.field}`;
          errors.push(nestedError);
        });
      }
    });

    return errors;
  }

  /**
   * Map class-validator constraint to error code
   */
  private mapConstraintToCode(constraint: string): ValidationErrorCode {
    const mapping: Record<string, ValidationErrorCode> = {
      isNotEmpty: ValidationErrorCode.REQUIRED_FIELD,
      isString: ValidationErrorCode.INVALID_TYPE,
      isNumber: ValidationErrorCode.INVALID_TYPE,
      isBoolean: ValidationErrorCode.INVALID_TYPE,
      isEmail: ValidationErrorCode.INVALID_EMAIL,
      isUrl: ValidationErrorCode.INVALID_URL,
      isDate: ValidationErrorCode.INVALID_DATE,
      isEnum: ValidationErrorCode.INVALID_ENUM,
      minLength: ValidationErrorCode.TOO_SHORT,
      maxLength: ValidationErrorCode.TOO_LONG,
      min: ValidationErrorCode.OUT_OF_RANGE,
      max: ValidationErrorCode.OUT_OF_RANGE,
      matches: ValidationErrorCode.INVALID_FORMAT,
    };

    return mapping[constraint] || ValidationErrorCode.CUSTOM_VALIDATION;
  }

  /**
   * Validate multiple items in bulk
   */
  async validateBulk(
    items: Array<{ id: string; data: Record<string, any> }>,
    constraints: Record<string, FieldConstraints>
  ): Promise<
    Array<{
      id: string;
      valid: boolean;
      errors: FieldValidationError[];
    }>
  > {
    const results = await Promise.all(
      items.map(async (item) => {
        const validation = await this.validateData(item.data, constraints);
        return {
          id: item.id,
          valid: validation.valid,
          errors: validation.errors,
        };
      })
    );

    return results;
  }

  /**
   * Throw exception if validation fails
   */
  async validateOrThrow(
    data: Record<string, any>,
    constraints: Record<string, FieldConstraints>
  ): Promise<void> {
    const result = await this.validateData(data, constraints);

    if (!result.valid) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.errors,
        errorCount: result.errorCount,
      });
    }
  }

  /**
   * Build validation message
   */
  private buildValidationMessage(
    errors: FieldValidationError[],
    warnings: FieldValidationError[]
  ): string {
    if (errors.length === 0 && warnings.length === 0) {
      return 'Validation passed';
    }

    const parts: string[] = [];

    if (errors.length > 0) {
      parts.push(`${errors.length} validation error${errors.length > 1 ? 's' : ''}`);
    }

    if (warnings.length > 0) {
      parts.push(`${warnings.length} warning${warnings.length > 1 ? 's' : ''}`);
    }

    return parts.join(', ');
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create validation rules from constraints
   */
  createValidationRules(
    constraints: Record<string, FieldConstraints>
  ): ValidationRule[] {
    const rules: ValidationRule[] = [];

    Object.entries(constraints).forEach(([field, constraint]) => {
      if (constraint.required) {
        rules.push({
          field,
          validate: (value) => value !== undefined && value !== null && value !== '',
          message: `${field} is required`,
          code: ValidationErrorCode.REQUIRED_FIELD,
        });
      }

      if (constraint.custom) {
        rules.push({
          field,
          validate: constraint.custom,
          message: constraint.customMessage || `${field} failed validation`,
          code: ValidationErrorCode.CUSTOM_VALIDATION,
        });
      }
    });

    return rules;
  }

  /**
   * Apply validation rules
   */
  async applyValidationRules(
    data: Record<string, any>,
    rules: ValidationRule[]
  ): Promise<ValidationResultDto> {
    const errors: FieldValidationError[] = [];

    for (const rule of rules) {
      const value = data[rule.field];

      try {
        const isValid = await rule.validate(value, data);

        if (!isValid) {
          errors.push({
            field: rule.field,
            message: rule.message,
            code: rule.code,
            value,
            severity: rule.severity || ValidationSeverity.ERROR,
          });
        }
      } catch (error) {
        errors.push({
          field: rule.field,
          message: `Validation error: ${error.message}`,
          code: ValidationErrorCode.CUSTOM_VALIDATION,
          value,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      errorCount: errors.length,
      warningCount: 0,
      message: this.buildValidationMessage(errors, []),
    };
  }
}
