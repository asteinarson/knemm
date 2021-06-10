## [Back to index](index.md)

# connect
```
knemm connect -s <state dir> <db_spec>
```
The command will connect a state with a specific database. [Documentation on dbspec here](dbspec.md).


## Example
```
$ knemm connect -s my-app-state @pg:my-app 
```

The example will create a file `my-app-state/___db.yaml`. It will store `pg` as client type and `my-app` as the database in it.  

## Options
None except for `-s` - which is mandatory.
