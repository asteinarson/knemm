# knemm
Knemm is a tool and library intended for DB schema administration and inspection, for relational 
(SQL) databases. It can be used both as a standalone CLI tool and as a Node.js dependency for an app 
that wants to manage its DB schema in a declarative way. It relies largely on the _Knex.js_ library
for connecting with and executing generated queries. 

**STATUS:** **knemm** is still in early development. The most central concepts (claims, states, modules) and basic commands should remain stable. Details and features are not yet stable.  

# Installing 
As of now, clone this repository (to a Linux/Unix host). Then run `npm install`. After that, build the TypeScript sources, using `tsc`. Then there should be a global command `knemm` available in the terminal. (Try `npm link` if NPM has not generated exec stubs).

Then you also likely want to add a database backend. The best supported ones are Postgresql and MySQL. SqLite is also supported but is feature limited at this time (no column modifications): 
```shell 
$ npm i pg   # Install the Postgres DB driver 
``` 

# Claims
Knemm uses a declarative YAML (or JSON) syntax (termed a **claim**), specifying what tables should exist and what is expected of named columns. A claim gives a minimum requirement that a database (or a collection of other claims - a **state**) should satisfy. 

Here's what a claim can look like (the example below uses this stored in a file `Person_1.yaml`): 
```yaml
id:
  branch: Person
  version: 1
___tables:
    person:
        id:
            data_type: int
            is_primary_key: true
            has_auto_increment: true
        email:
            data_type: varchar
            max_length: 255
            is_unique: true 
        first_name:
            data_type: varchar
            max_length: 64
```

or equivalently in **hrc** format: 
```yaml
id: Person_1 
___tables:
    person:
        id: int pk auto
        email: varchar(255) unique
        first_name: varchar(64)
```

The first format is called **internal** and is always used internally when comparing, processing and merging claims. The second format - **hrc** - is used for compact notation - when reading / writing files. A correctly formed claim can be converted back and forth between these two formats, without loss, so for practical purposes, they are interchangeable. (**hrc** stands for: ***h**uman **r**eadable **c**ompact form*.)

### Claims - Example
The first YAML source above will be processed (merged) by the command `join`: 
```shell
$ knemm join Person_1.yaml 
person:
  id: int pk auto
  email: varchar(255) unique
  first_name: varchar(64)
```
The command read the single input claim, merged it into an empty state and printed it back in **hrc** format. Can we convert it back to internal form?  
```shell
$ knemm join Person_1.yaml | knemm join -i - 
person:
  ___owner: STDIN
  id:
    data_type: int
    is_primary_key: true
    has_auto_increment: true
  email:
    max_length: 255
    data_type: varchar
    is_unique: true
  first_name:
    max_length: 64
    data_type: varchar
```
Yes, we could, by piping the output to another `knemm`, specifying `-i` (generate output in internal format) - and specifying STDIN as the source for the claim (via the last **-**). Since the first command stripped away the claim ID, `knemm` has added `STDIN` as the ID of the claim. 

## Claims on the same branch
In the YAML above, your see that the ID of it is `Person_1`. Say that we want to add a column `second_name` to the table, then we can create a second claim: 

```yaml
id: Person_2 
___tables:
    person:
        second_name: varchar(64)
```

Claims on the same branch are always merged sequentially, so a higher version number can do one or more of: 
  - Adding tables/columns to the branch
  - Modifying previously declared properties - in this branch
  - Dropping / removing tables (or columns) - also on the same branch

### Claims on the same branch - Example
We store below in a file `Person_2.yaml`: 
```yaml
person:
    second_name: varchar(64)
```
Then we can merge the two claims: 
```shell
$ knemm join Person_1.yaml Person_2.yaml 
person:
  id: int pk auto
  email: varchar(255) unique
  first_name: varchar(64)
  second_name: varchar(64)
```
Actually we don't have to specify each claim it should use. It suffices that we specifies *the highest versioned claim on each branch*: 
```shell
$ knemm join Person_2.yaml 
person:
   # ... same as above
```
`knemm` understands by itself that it should use `Person_1` as a depenency, if it can be found. 

## Claim invariability 
The idea of putting changes in new (higher versioned) claim files (instead of just editing the previous claim file) is that the first claim might already be distributed and applied on existing databases. 

So one should really only edit a claim file **before** it has been deployed somewhere. 

### Claim invariability - Example 
We realize that some emails can be very long. So we would like to have a `TEXT` column there, instead of the `VARCHAR`. We add a new claim - `Person_3.yaml`: 

```yaml
person:
    email: text
```
Then we can merge the two claims: 
```shell
$ knemm join Person_3.yaml 
person:
  id: int pk auto
  email: text unique
  first_name: varchar(64)
  second_name: varchar(64)
```
As you see, we only modified the data type of `email`. The `unique` property was declared before, and it just remained there: 

> **knemm** aims at fulfilling each claim with the smallest possible modification. 

## Claim ID:s 

The ID is a name and a version number. The version number can be either an integer: 1, 3, 14, ... or a decimal number: 1.32, 1.33, 1.321, 1.5, 2, 2.1... In ordinary situations, using integer numbers is enough. 

There can be holes between version numbers, so this if just these claims exist, it is just fine: 

  * Person_1 
  * Person_2 
  * Person_4
  * Person_7 

### Explicit / implicit claim ID:s
A claim ID can either be explicitely declared:
```yaml
id:
  branch: Person
  version: 4
```
or the ID can be contained in their filenames: 
```shell
$ ls Person*.yaml 
Person_1.yaml  Person_2.yaml  Person_4.yaml Person_7.yaml
```
In the latter case, one can omit the ID from the internal YAML - and optionally leave out the whole YAML/JSON top level, and end up with the content of `Person_1.yaml` being: 
```yaml
person:
    id: int pk auto
    email: varchar(255) unique
    first_name: varchar(64)
```
The file just contains the **___tables** section. So we then have a very compact way of expressing DB claims. 

# States
So far we have specified claims as inputs and had `knemm` check and merge them and then print the result to stdout. However, if we have an application, we likely want to store its DB schema more persistently. To achieve this, we can specify a state directory, via `-s` to `knemm`:
```shell
$ knemm join -s person-app Person_3.yaml 
# Same output as before 
$ ls person-app 
Person_1.yaml  Person_2.yaml  Person_3.yaml  ___merge.yaml
```
So we got a directory created and a file `___merge.yaml` created there. And each claim that was used to build it was copied here. You can inspect the generated file `___merge.yaml` in a text viewer. It contains the merge and a couple of internal properties has been added to it. Keep in mind: 
> `___merge.yaml` is automatically generated and should not be manually edited. 

Now if we (later) want to inspect a given state, we can run: 
```bash
$ knemm join -s person-app 
# ... we get the full table state printed out here
```

# States and Databases
The state we created above still (by itself) is not a DB schema. However, one can use it to check if a DB fulfills that given state. If not, one can request a diff to be generated, that can be applied to a given DB. Or one can apply the given state to a given DB. 

It can be noted that a given DB can either lag behind the state, it can be in sync with it, or even ahead of it. None of these are **wrong**. They are just states and differences.

# Branches / modules
**Branch** and **module** mean the same thing, it is simply the name put there in the claim ID. From the apps point of view, **module** is the better name, as what it allows for is to have several concurrent flows of migrations - representing loosely coupled software modules. 

One module (say **sales-order**) is the primary authority on the tables and columns it declares itself. But... it can depend on tables and columns from other modules (say **catalog-product**) and specify minimum database requirements it needs from that other module. 

Knemm will then check those requirements, and either the combination works out just fine, or it fails, and we get an error message when attempting to merge / apply the claims. 

So we have a declarative way of letting loosely coupled software modules depend on each other, and to know beforehand if their database expectations will work out - or not. 

The two **'m'**:s in *Knemm* stands for just that, *multi-migrations* (several connected flows of DB migrations connected with dependecy points and explicit expectations). 





