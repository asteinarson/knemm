## [Back to index](index.md)

# echo

```
knedb echo [options] <db_spec> [name_of_db]
```
The command will echo all resulting connection information based on the **dbspec** and additional fallback configuration - [more information here](dbspec.md).

The command can be used to check that the connection data really is what one expects, one can test the connection (`-t`) with it, and one can generate connection files from it (`-o` option). 

The last argument `name_of_db` is optional. 

## Example
```
$ knedb echo @mysql:my-app  
client: mysql
connection:
  host: localhost
  user: arst
```

## Options

| Short form | Long form | Explanation | 
| --- | --- | --- | 
| `-t` | `--test` | Test the connection - with a simple 'SELECT 1+1' | 
| `-j` | `--json` | Generate output in JSON - not in YAML | 
| `-o` | `--outfile` | Outputs a new DB file for the DB connection | 



