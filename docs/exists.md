## [Back to index](index.md)

# exists

```
knedb exists [options] <db_spec> [name_of_db]
```
The command will see if a given database exists or not. If so, it echoes `yes`. Otherwise it responds `no`. For more information on **dbspec** - [read here](dbspec.md).


## Example
```
$ knedb exists my_name?my_pass@mysql:my_app   
yes 
$ knedb exists my_name?my_pass@mysql:my_app_new   
no 
```

## Options
None. 
