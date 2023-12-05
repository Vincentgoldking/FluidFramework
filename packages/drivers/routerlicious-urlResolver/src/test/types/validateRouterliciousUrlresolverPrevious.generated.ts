/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-test-generator in @fluidframework/build-tools.
 */
import type * as old from "@fluidframework/routerlicious-urlresolver-previous";
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
* "InterfaceDeclaration_IAlfredUser": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IAlfredUser():
    TypeOnly<old.IAlfredUser>;
declare function use_current_InterfaceDeclaration_IAlfredUser(
    use: TypeOnly<current.IAlfredUser>): void;
use_current_InterfaceDeclaration_IAlfredUser(
    get_old_InterfaceDeclaration_IAlfredUser());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IAlfredUser": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IAlfredUser():
    TypeOnly<current.IAlfredUser>;
declare function use_old_InterfaceDeclaration_IAlfredUser(
    use: TypeOnly<old.IAlfredUser>): void;
use_old_InterfaceDeclaration_IAlfredUser(
    get_current_InterfaceDeclaration_IAlfredUser());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IConfig": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IConfig():
    TypeOnly<old.IConfig>;
declare function use_current_InterfaceDeclaration_IConfig(
    use: TypeOnly<current.IConfig>): void;
use_current_InterfaceDeclaration_IConfig(
    get_old_InterfaceDeclaration_IConfig());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IConfig": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IConfig():
    TypeOnly<current.IConfig>;
declare function use_old_InterfaceDeclaration_IConfig(
    use: TypeOnly<old.IConfig>): void;
use_old_InterfaceDeclaration_IConfig(
    get_current_InterfaceDeclaration_IConfig());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_RouterliciousUrlResolver": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_RouterliciousUrlResolver():
    TypeOnly<old.RouterliciousUrlResolver>;
declare function use_current_ClassDeclaration_RouterliciousUrlResolver(
    use: TypeOnly<current.RouterliciousUrlResolver>): void;
use_current_ClassDeclaration_RouterliciousUrlResolver(
    get_old_ClassDeclaration_RouterliciousUrlResolver());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_RouterliciousUrlResolver": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_RouterliciousUrlResolver():
    TypeOnly<current.RouterliciousUrlResolver>;
declare function use_old_ClassDeclaration_RouterliciousUrlResolver(
    use: TypeOnly<old.RouterliciousUrlResolver>): void;
use_old_ClassDeclaration_RouterliciousUrlResolver(
    get_current_ClassDeclaration_RouterliciousUrlResolver());
