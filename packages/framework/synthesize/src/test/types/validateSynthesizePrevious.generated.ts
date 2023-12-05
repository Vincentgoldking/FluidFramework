/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-test-generator in @fluidframework/build-tools.
 */
import type * as old from "@fluidframework/synthesize-previous";
import type * as current from "../../index";


// See 'build-tools/src/type-test-generator/compatibility.ts' for more information.
type TypeOnly<T> = T extends number
	? number
	: T extends string
	? string
	: T extends boolean | bigint | symbol
	? T
	: {
			[P in keyof T]: TypeOnly<T[P]>;
	  };

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_AsyncFluidObjectProvider": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_AsyncFluidObjectProvider():
    TypeOnly<old.AsyncFluidObjectProvider<any,any>>;
declare function use_current_TypeAliasDeclaration_AsyncFluidObjectProvider(
    use: TypeOnly<current.AsyncFluidObjectProvider<any,any>>): void;
use_current_TypeAliasDeclaration_AsyncFluidObjectProvider(
    get_old_TypeAliasDeclaration_AsyncFluidObjectProvider());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_AsyncFluidObjectProvider": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_AsyncFluidObjectProvider():
    TypeOnly<current.AsyncFluidObjectProvider<any,any>>;
declare function use_old_TypeAliasDeclaration_AsyncFluidObjectProvider(
    use: TypeOnly<old.AsyncFluidObjectProvider<any,any>>): void;
use_old_TypeAliasDeclaration_AsyncFluidObjectProvider(
    get_current_TypeAliasDeclaration_AsyncFluidObjectProvider());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_AsyncOptionalFluidObjectProvider": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_AsyncOptionalFluidObjectProvider():
    TypeOnly<old.AsyncOptionalFluidObjectProvider<any>>;
declare function use_current_TypeAliasDeclaration_AsyncOptionalFluidObjectProvider(
    use: TypeOnly<current.AsyncOptionalFluidObjectProvider<any>>): void;
use_current_TypeAliasDeclaration_AsyncOptionalFluidObjectProvider(
    get_old_TypeAliasDeclaration_AsyncOptionalFluidObjectProvider());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_AsyncOptionalFluidObjectProvider": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_AsyncOptionalFluidObjectProvider():
    TypeOnly<current.AsyncOptionalFluidObjectProvider<any>>;
declare function use_old_TypeAliasDeclaration_AsyncOptionalFluidObjectProvider(
    use: TypeOnly<old.AsyncOptionalFluidObjectProvider<any>>): void;
use_old_TypeAliasDeclaration_AsyncOptionalFluidObjectProvider(
    get_current_TypeAliasDeclaration_AsyncOptionalFluidObjectProvider());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_AsyncRequiredFluidObjectProvider": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_AsyncRequiredFluidObjectProvider():
    TypeOnly<old.AsyncRequiredFluidObjectProvider<any>>;
declare function use_current_TypeAliasDeclaration_AsyncRequiredFluidObjectProvider(
    use: TypeOnly<current.AsyncRequiredFluidObjectProvider<any>>): void;
use_current_TypeAliasDeclaration_AsyncRequiredFluidObjectProvider(
    get_old_TypeAliasDeclaration_AsyncRequiredFluidObjectProvider());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_AsyncRequiredFluidObjectProvider": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_AsyncRequiredFluidObjectProvider():
    TypeOnly<current.AsyncRequiredFluidObjectProvider<any>>;
declare function use_old_TypeAliasDeclaration_AsyncRequiredFluidObjectProvider(
    use: TypeOnly<old.AsyncRequiredFluidObjectProvider<any>>): void;
use_old_TypeAliasDeclaration_AsyncRequiredFluidObjectProvider(
    get_current_TypeAliasDeclaration_AsyncRequiredFluidObjectProvider());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_DependencyContainer": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_DependencyContainer():
    TypeOnly<old.DependencyContainer<any>>;
declare function use_current_ClassDeclaration_DependencyContainer(
    use: TypeOnly<current.DependencyContainer<any>>): void;
use_current_ClassDeclaration_DependencyContainer(
    get_old_ClassDeclaration_DependencyContainer());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_DependencyContainer": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_DependencyContainer():
    TypeOnly<current.DependencyContainer<any>>;
declare function use_old_ClassDeclaration_DependencyContainer(
    use: TypeOnly<old.DependencyContainer<any>>): void;
use_old_ClassDeclaration_DependencyContainer(
    get_current_ClassDeclaration_DependencyContainer());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_FluidObjectProvider": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_FluidObjectProvider():
    TypeOnly<old.FluidObjectProvider<any>>;
declare function use_current_TypeAliasDeclaration_FluidObjectProvider(
    use: TypeOnly<current.FluidObjectProvider<any>>): void;
use_current_TypeAliasDeclaration_FluidObjectProvider(
    get_old_TypeAliasDeclaration_FluidObjectProvider());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_FluidObjectProvider": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_FluidObjectProvider():
    TypeOnly<current.FluidObjectProvider<any>>;
declare function use_old_TypeAliasDeclaration_FluidObjectProvider(
    use: TypeOnly<old.FluidObjectProvider<any>>): void;
use_old_TypeAliasDeclaration_FluidObjectProvider(
    get_current_TypeAliasDeclaration_FluidObjectProvider());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_FluidObjectSymbolProvider": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_FluidObjectSymbolProvider():
    TypeOnly<old.FluidObjectSymbolProvider<any>>;
declare function use_current_TypeAliasDeclaration_FluidObjectSymbolProvider(
    use: TypeOnly<current.FluidObjectSymbolProvider<any>>): void;
use_current_TypeAliasDeclaration_FluidObjectSymbolProvider(
    get_old_TypeAliasDeclaration_FluidObjectSymbolProvider());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_FluidObjectSymbolProvider": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_FluidObjectSymbolProvider():
    TypeOnly<current.FluidObjectSymbolProvider<any>>;
declare function use_old_TypeAliasDeclaration_FluidObjectSymbolProvider(
    use: TypeOnly<old.FluidObjectSymbolProvider<any>>): void;
use_old_TypeAliasDeclaration_FluidObjectSymbolProvider(
    get_current_TypeAliasDeclaration_FluidObjectSymbolProvider());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "VariableDeclaration_IFluidDependencySynthesizer": {"forwardCompat": false}
*/
declare function get_old_VariableDeclaration_IFluidDependencySynthesizer():
    TypeOnly<typeof old.IFluidDependencySynthesizer>;
declare function use_current_VariableDeclaration_IFluidDependencySynthesizer(
    use: TypeOnly<typeof current.IFluidDependencySynthesizer>): void;
use_current_VariableDeclaration_IFluidDependencySynthesizer(
    get_old_VariableDeclaration_IFluidDependencySynthesizer());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "VariableDeclaration_IFluidDependencySynthesizer": {"backCompat": false}
*/
declare function get_current_VariableDeclaration_IFluidDependencySynthesizer():
    TypeOnly<typeof current.IFluidDependencySynthesizer>;
declare function use_old_VariableDeclaration_IFluidDependencySynthesizer(
    use: TypeOnly<typeof old.IFluidDependencySynthesizer>): void;
use_old_VariableDeclaration_IFluidDependencySynthesizer(
    get_current_VariableDeclaration_IFluidDependencySynthesizer());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IFluidDependencySynthesizer": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IFluidDependencySynthesizer():
    TypeOnly<old.IFluidDependencySynthesizer>;
declare function use_current_InterfaceDeclaration_IFluidDependencySynthesizer(
    use: TypeOnly<current.IFluidDependencySynthesizer>): void;
use_current_InterfaceDeclaration_IFluidDependencySynthesizer(
    get_old_InterfaceDeclaration_IFluidDependencySynthesizer());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IFluidDependencySynthesizer": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IFluidDependencySynthesizer():
    TypeOnly<current.IFluidDependencySynthesizer>;
declare function use_old_InterfaceDeclaration_IFluidDependencySynthesizer(
    use: TypeOnly<old.IFluidDependencySynthesizer>): void;
use_old_InterfaceDeclaration_IFluidDependencySynthesizer(
    get_current_InterfaceDeclaration_IFluidDependencySynthesizer());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IProvideFluidDependencySynthesizer": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IProvideFluidDependencySynthesizer():
    TypeOnly<old.IProvideFluidDependencySynthesizer>;
declare function use_current_InterfaceDeclaration_IProvideFluidDependencySynthesizer(
    use: TypeOnly<current.IProvideFluidDependencySynthesizer>): void;
use_current_InterfaceDeclaration_IProvideFluidDependencySynthesizer(
    get_old_InterfaceDeclaration_IProvideFluidDependencySynthesizer());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IProvideFluidDependencySynthesizer": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IProvideFluidDependencySynthesizer():
    TypeOnly<current.IProvideFluidDependencySynthesizer>;
declare function use_old_InterfaceDeclaration_IProvideFluidDependencySynthesizer(
    use: TypeOnly<old.IProvideFluidDependencySynthesizer>): void;
use_old_InterfaceDeclaration_IProvideFluidDependencySynthesizer(
    get_current_InterfaceDeclaration_IProvideFluidDependencySynthesizer());
