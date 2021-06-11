## [Back to index](index.md)
# Claim ID:s 

The claim ID is a name and a version number. The version number can be either an integer: 1, 3, 14, ... or a decimal number: 1.32, 2.1, 3.5, ... In ordinary situations, using integer numbers 
is the best. 

There can be holes between version numbers, so this if just these claims exist, it is OK: 

  * Person_1 
  * Person_2 
  * Person_4
  * Person_7 

### Implicit / Explicit claim ID:s
A claim ID can either be explicitly declared:
```yaml
id:
  branch: Person
  version: 4
```
or the ID can implicitely be contained in its filename: 
```shell
$ ls Person*.yaml 
Person_1.yaml  Person_2.yaml  Person_4.yaml Person_7.yaml
```
In the latter case, one can omit the ID from the internal YAML - and optionally leave out the whole YAML/JSON top level, and end up with the content of `Person_1.yaml` being: 
```yaml
person:
    id: int pk auto_inc
    email: varchar(255) unique
    first_name: varchar(64)
```
The file just contains the **___tables** section. So we then have a very compact way of expressing DB claims. 

### Recommendation: Use implicit ID:s
With ID:s contained in filenames, `knemm` will not have to search for related or dependenent 
claims in arbitrarily named YAML/JSON files. If the ID is not available in the filename, then
`knemm` will basically have to load and try parsing every YAML/JSON file available to it, and
that of course can be inefficient.

### What if ID is both in filename and inside the YAML file? 
If the is declared inside the claim file it must be the same as in the filename itself. 
Otherwise it is reported as an error. 

## [Back to index](index.md)
