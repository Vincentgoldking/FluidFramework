/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-test-generator in @fluidframework/build-tools.
 */
import * as old from "@fluidframework/web-code-loader-previous";
import * as current from "../../index";

type TypeOnly<T> = {
    [P in keyof T]: TypeOnly<T[P]>;
};

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_AllowList": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_AllowList():
    TypeOnly<old.AllowList>;
declare function use_current_ClassDeclaration_AllowList(
    use: TypeOnly<current.AllowList>);
use_current_ClassDeclaration_AllowList(
    get_old_ClassDeclaration_AllowList());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_AllowList": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_AllowList():
    TypeOnly<current.AllowList>;
declare function use_old_ClassDeclaration_AllowList(
    use: TypeOnly<old.AllowList>);
use_old_ClassDeclaration_AllowList(
    get_current_ClassDeclaration_AllowList());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IPackageIdentifierDetails": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IPackageIdentifierDetails():
    TypeOnly<old.IPackageIdentifierDetails>;
declare function use_current_InterfaceDeclaration_IPackageIdentifierDetails(
    use: TypeOnly<current.IPackageIdentifierDetails>);
use_current_InterfaceDeclaration_IPackageIdentifierDetails(
    get_old_InterfaceDeclaration_IPackageIdentifierDetails());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IPackageIdentifierDetails": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IPackageIdentifierDetails():
    TypeOnly<current.IPackageIdentifierDetails>;
declare function use_old_InterfaceDeclaration_IPackageIdentifierDetails(
    use: TypeOnly<old.IPackageIdentifierDetails>);
use_old_InterfaceDeclaration_IPackageIdentifierDetails(
    get_current_InterfaceDeclaration_IPackageIdentifierDetails());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_SemVerCdnCodeResolver": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_SemVerCdnCodeResolver():
    TypeOnly<old.SemVerCdnCodeResolver>;
declare function use_current_ClassDeclaration_SemVerCdnCodeResolver(
    use: TypeOnly<current.SemVerCdnCodeResolver>);
use_current_ClassDeclaration_SemVerCdnCodeResolver(
    get_old_ClassDeclaration_SemVerCdnCodeResolver());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_SemVerCdnCodeResolver": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_SemVerCdnCodeResolver():
    TypeOnly<current.SemVerCdnCodeResolver>;
declare function use_old_ClassDeclaration_SemVerCdnCodeResolver(
    use: TypeOnly<old.SemVerCdnCodeResolver>);
use_old_ClassDeclaration_SemVerCdnCodeResolver(
    get_current_ClassDeclaration_SemVerCdnCodeResolver());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_WebCodeLoader": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_WebCodeLoader():
    TypeOnly<old.WebCodeLoader>;
declare function use_current_ClassDeclaration_WebCodeLoader(
    use: TypeOnly<current.WebCodeLoader>);
use_current_ClassDeclaration_WebCodeLoader(
    get_old_ClassDeclaration_WebCodeLoader());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_WebCodeLoader": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_WebCodeLoader():
    TypeOnly<current.WebCodeLoader>;
declare function use_old_ClassDeclaration_WebCodeLoader(
    use: TypeOnly<old.WebCodeLoader>);
use_old_ClassDeclaration_WebCodeLoader(
    get_current_ClassDeclaration_WebCodeLoader());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "FunctionDeclaration_extractPackageIdentifierDetails": {"forwardCompat": false}
*/
declare function get_old_FunctionDeclaration_extractPackageIdentifierDetails():
    TypeOnly<typeof old.extractPackageIdentifierDetails>;
declare function use_current_FunctionDeclaration_extractPackageIdentifierDetails(
    use: TypeOnly<typeof current.extractPackageIdentifierDetails>);
use_current_FunctionDeclaration_extractPackageIdentifierDetails(
    get_old_FunctionDeclaration_extractPackageIdentifierDetails());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "FunctionDeclaration_extractPackageIdentifierDetails": {"backCompat": false}
*/
declare function get_current_FunctionDeclaration_extractPackageIdentifierDetails():
    TypeOnly<typeof current.extractPackageIdentifierDetails>;
declare function use_old_FunctionDeclaration_extractPackageIdentifierDetails(
    use: TypeOnly<typeof old.extractPackageIdentifierDetails>);
use_old_FunctionDeclaration_extractPackageIdentifierDetails(
    get_current_FunctionDeclaration_extractPackageIdentifierDetails());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "FunctionDeclaration_resolveFluidPackageEnvironment": {"forwardCompat": false}
*/
declare function get_old_FunctionDeclaration_resolveFluidPackageEnvironment():
    TypeOnly<typeof old.resolveFluidPackageEnvironment>;
declare function use_current_FunctionDeclaration_resolveFluidPackageEnvironment(
    use: TypeOnly<typeof current.resolveFluidPackageEnvironment>);
use_current_FunctionDeclaration_resolveFluidPackageEnvironment(
    get_old_FunctionDeclaration_resolveFluidPackageEnvironment());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "FunctionDeclaration_resolveFluidPackageEnvironment": {"backCompat": false}
*/
declare function get_current_FunctionDeclaration_resolveFluidPackageEnvironment():
    TypeOnly<typeof current.resolveFluidPackageEnvironment>;
declare function use_old_FunctionDeclaration_resolveFluidPackageEnvironment(
    use: TypeOnly<typeof old.resolveFluidPackageEnvironment>);
use_old_FunctionDeclaration_resolveFluidPackageEnvironment(
    get_current_FunctionDeclaration_resolveFluidPackageEnvironment());
