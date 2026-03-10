import { registerDecorator, ValidationOptions, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsEndTimeAfterStartTimeConstraint implements ValidatorConstraintInterface {
  validate(obj: any, args: ValidationArguments) {
    if (!obj) return true;
    const start = obj.startTime;
    const end = obj.endTime;
    if (!start || !end) return true; // skip if missing (other validators handle required)
    // parse HH:MM
    const parse = (s: string) => {
      const [h, m] = s.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      return h * 60 + m;
    };
    const sMinutes = parse(start);
    const eMinutes = parse(end);
    if (sMinutes === null || eMinutes === null) return false;
    return eMinutes > sMinutes;
  }
  defaultMessage(args: ValidationArguments) {
    return 'endTime must be after startTime';
  }
}

export function IsEndTimeAfterStartTime(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: {
        validate(value: any, args: ValidationArguments) {
          // value is the object instance when applied as class-level decorator
          return new IsEndTimeAfterStartTimeConstraint().validate(value, args);
        },
      },
    });
  };
}

@ValidatorConstraint({ async: false })
export class IsEndDateAfterOrEqualStartDateConstraint implements ValidatorConstraintInterface {
  validate(obj: any, args: ValidationArguments) {
    if (!obj) return true;
    const start = obj.startDate;
    const end = obj.endDate;
    if (!start || !end) return true; // nothing to validate
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
    return e.getTime() >= s.getTime();
  }
  defaultMessage(args: ValidationArguments) {
    return 'endDate must be the same or after startDate';
  }
}

export function IsEndDateAfterOrEqualStartDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: {
        validate(value: any, args: ValidationArguments) {
          return new IsEndDateAfterOrEqualStartDateConstraint().validate(value, args);
        },
      },
    });
  };
}

@ValidatorConstraint({ async: false })
export class IsLocationRequiredForEventTypeConstraint implements ValidatorConstraintInterface {
  validate(obj: any, args: ValidationArguments) {
    if (!obj) return true;
    const eventType = obj.type;
    const location = obj.location;
    
    // If Online event, location is optional
    if (eventType === 'Online') {
      return true; // Optional, so always valid
    }
    
    // For In-person and Hybrid, location is required
    if (eventType === 'In-person' || eventType === 'Hybrid') {
      return location !== undefined && location !== null && String(location).trim().length > 0;
    }
    
    return true;
  }
  
  defaultMessage(args: ValidationArguments) {
    const obj = args.object as any;
    const eventType = obj?.type || 'événement';
    return `Le lieu est requis pour les événements ${eventType}`;
  }
}

export function IsLocationRequiredForEventType(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: {
        validate(value: any, args: ValidationArguments) {
          return new IsLocationRequiredForEventTypeConstraint().validate(value, args);
        },
      },
    });
  };
}

@ValidatorConstraint({ async: false })
export class IsOnlineUrlRequiredForEventTypeConstraint implements ValidatorConstraintInterface {
  validate(obj: any, args: ValidationArguments) {
    if (!obj) return true;
    const eventType = obj.type;
    const onlineUrl = obj.onlineUrl;
    
    // If In-person event, onlineUrl is optional
    if (eventType === 'In-person') {
      // If provided, must be valid URL
      if (onlineUrl !== undefined && onlineUrl !== null && String(onlineUrl).trim().length > 0) {
        try {
          new URL(String(onlineUrl));
          return true;
        } catch {
          return false;
        }
      }
      return true; // Optional, so empty is valid
    }
    
    // For Online and Hybrid, onlineUrl is required and must be valid URL
    if (eventType === 'Online' || eventType === 'Hybrid') {
      if (!onlineUrl || String(onlineUrl).trim().length === 0) {
        return false;
      }
      try {
        new URL(String(onlineUrl));
        return true;
      } catch {
        return false;
      }
    }
    
    return true;
  }
  
  defaultMessage(args: ValidationArguments) {
    const obj = args.object as any;
    const eventType = obj?.type || 'événement';
    if (eventType === 'Online' || eventType === 'Hybrid') {
      return `L'URL en ligne est requise et doit être valide pour les événements ${eventType}`;
    }
    return `L'URL en ligne doit être valide si fournie`;
  }
}

export function IsOnlineUrlRequiredForEventType(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: {
        validate(value: any, args: ValidationArguments) {
          return new IsOnlineUrlRequiredForEventTypeConstraint().validate(value, args);
        },
      },
    });
  };
}