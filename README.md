# Heartbeat engineering challenge

## Task1

---

### software design

<img src="./assets/systemDesign.png" alt="brief design" />

---

## system description

1. app start by (yarn start or npm start)
### index

2. redis client initiate and HBExporterDependencies created base on redisclient, generated UUID and permission and also logger :

```{
    cache: redisClient,
    UUIDGen: MockUUIDGen,
    allowedPermission: "",
    permissionsService: permissions,
    logger: loggedInfo,
  }
```

3. user create by id and permission list:

```
{
    id: "number",
    permissions: [],
}
```

4. exporter will be create by exporterDeps and StartExport will start working by myUser and file content which is streamed by mockOpenFile()

### exporter
### StartExport(user,data)

- 4.1. logger log the string "starting export"

- 4.2 permission check using PermissionsService 's CheckPermissions using userinfo and permissions and if not allowed error "incorrect permission" will be thrown

* 4.3. redis exportId key's value will be set

```
{
          status: "CREATED",
          id: generatedNewUUID,
}
```

4.4 write and attach data to stream using function newCacheWriter(exportId,cache):

- 4.4.1: unitl data is available data will be written chunk by chunk to exportedId by passing pending status
- 4.4.2 by finalizing data status COMPLETE will return and 3600 expire time will be set for exportedId key

5. while app is run every 500 ms GetExportStatus(id) check the status of export and will get the status based on exportId key of redis cache data

### logger

includes types: 
```Logger``` , ```Stringable```,```ToString``` types 

```NewMockLogger``` public function
- to return a mocked log 

```fieldsToString``` function
 - to stringify optional field if its passed on it

### permissions
includes:

public interface: ```PermissionsService``` 

public type: ```User```
 
public function ```MockPermissions``` that check permission based on permissions that passed user has

###
includes: 
 
public interface: ```UUID```

public function: ```MockUUIDGen``` returns generated('AAAA') UUID :D

---

# Task 3

What would you improve? We know this feature isn't great. What would you change?

1. we can have essentials or utils for some works like mockOpenFile, and sleep etc.
2. I think having a controller will make the structure more SOLID because it is not exporter's duty to check the user permissions, before this it can be checked in controller.
3. being more modular(permission, log, exporter) with their own services and controllers will help this structure  
4. if I had time to check the ability of IO block vs await form of data streaming and binding in redis ,I  think we can improve it better